/**
 * Gravação do negócio (parte pura): endereço do contato, complemento de contato existente,
 * avisos de gravação parcial e regressões de tela (campos sem envio, reset ao recusar,
 * categoria de anexos, etapa fora da edição). O ciclo com banco fica em negocios-gravacao-db.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { arquivosEscolhidos, LIMITE_ANEXO, prepararEnvioCriacao, problemaArquivo } from "@/lib/anexos-regras";
import { AVISOS_CRIACAO, avisosDaUrl, completarContato, montarEndereco } from "@/lib/negocio-dados";

const fonte = (...partes: string[]) => readFileSync(join(__dirname, "..", ...partes), "utf8");

describe("endereço do contato", () => {
  it("junta rua, número, complemento, bairro e CEP; cidade e UF ficam de fora", () => {
    expect(montarEndereco({ rua: "Rua A", numero: "10", complemento: "ap 2", bairro: "Centro", cep: "85800-000" })).toBe(
      "Rua A, 10, ap 2, Centro, CEP 85800-000",
    );
    expect(montarEndereco({ rua: " Rua A ", numero: "" })).toBe("Rua A");
    expect(montarEndereco({})).toBe("");
  });
});

describe("contato já cadastrado", () => {
  const salvo = { endereco: "Rua C, 30", cidade: "Toledo", uf: null };

  it("só preenche o que está vazio", () => {
    expect(completarContato(salvo, { endereco: null, cidade: null, uf: "PR" })).toEqual({ alteracoes: { uf: "PR" }, divergentes: [] });
  });

  it("nunca sobrescreve dado diferente: lista como divergente", () => {
    expect(completarContato(salvo, { endereco: "Rua D, 1", cidade: "Cascavel", uf: "PR" })).toEqual({
      alteracoes: { uf: "PR" },
      divergentes: ["endereco", "cidade"],
    });
  });

  it("mesmo dado com outra caixa ou espaços não é divergência", () => {
    expect(completarContato(salvo, { endereco: "rua c,   30", cidade: " TOLEDO ", uf: null })).toEqual({ alteracoes: {}, divergentes: [] });
  });
});

describe("avisos de gravação parcial", () => {
  it("lê só códigos conhecidos da URL", () => {
    expect(avisosDaUrl("kit,anexos,kit,<script>")).toEqual(["kit", "anexos"]);
    expect(avisosDaUrl(["calculo", "contato"])).toEqual(["calculo", "contato"]);
    expect(avisosDaUrl(undefined)).toEqual([]);
    expect(avisosDaUrl("constructor,__proto__")).toEqual([]);
  });

  it("todo aviso que o núcleo emite tem mensagem", () => {
    const nucleo = fonte("src", "lib", "negocios-gravacao.ts");
    for (const codigo of nucleo.matchAll(/avisos\.push\("(\w+)"\)/g)) expect(Object.keys(AVISOS_CRIACAO)).toContain(codigo[1]);
  });
});

describe("arquivos fora da Server Action", () => {
  const semEscolha = () => new File([], "", { type: "application/octet-stream" });

  it("ignora o arquivo vazio sem nome (nada escolhido), mas mantém o vazio escolhido pelo usuário", () => {
    const f = new FormData();
    f.append("anexo_geral", semEscolha());
    f.append("anexo_geral", new File([], "vazio.png"));
    f.append("anexo_geral", new File(["x"], "ok.png"));
    expect(arquivosEscolhidos(f, "anexo_geral").map((a) => a.name)).toEqual(["vazio.png", "ok.png"]);
  });

  it("recusa vazio e acima de 20 MB", () => {
    expect(problemaArquivo({ nome: "a.png", tamanho: 0 })).toContain("vazio");
    expect(problemaArquivo({ nome: "a.png", tamanho: LIMITE_ANEXO + 1 })).toContain("20 MB");
    expect(problemaArquivo({ nome: "a.png", tamanho: LIMITE_ANEXO })).toBeNull();
  });

  it("o cadastro manda à ação só os dados dos arquivos, na ordem dos campos", () => {
    const f = new FormData();
    f.append("titulo", "Negócio");
    f.append("anexo_geral", new File(["foto"], "foto.png", { type: "image/png" }));
    f.append("anexo_cnh_contato", new File(["cnh"], "cnh.png", { type: "image/png" }));
    f.append("anexo_fatura_gerador", semEscolha());
    const { dados, arquivos, problema } = prepararEnvioCriacao(f);
    expect(problema).toBeNull();
    expect([...dados.values()].some((v) => v instanceof File)).toBe(false);
    expect(dados.get("titulo")).toBe("Negócio");
    expect(arquivos.map((a) => a.campo)).toEqual(["anexo_cnh_contato", "anexo_geral"]);
    expect(JSON.parse(String(dados.get("anexos")))).toEqual([
      { campo: "anexo_cnh_contato", nome: "cnh.png", tamanho: 3, tipoMime: "image/png" },
      { campo: "anexo_geral", nome: "foto.png", tamanho: 4, tipoMime: "image/png" },
    ]);
  });

  it("nenhum formulário do negócio manda arquivo para Server Action", () => {
    const formulario = fonte("src", "app", "(app)", "negocios", "novo", "formulario.tsx");
    const edicao = fonte("src", "app", "(app)", "negocios", "[id]", "edicao.tsx");
    expect(formulario).toContain("prepararEnvioCriacao(new FormData(evento.currentTarget))");
    expect(formulario).toContain("enviarArquivosReservados(");
    expect(edicao).toContain('formulario.delete("anexo_fatura_energia")');
    expect(edicao).toContain("enviarArquivosReservados(");
    expect(fonte("src", "lib", "negocios-gravacao.ts")).not.toMatch(/instanceof File|\.upload\(/);
  });
});

describe("regressões de tela", () => {
  const formulario = fonte("src", "app", "(app)", "negocios", "novo", "formulario.tsx");
  const edicao = fonte("src", "app", "(app)", "negocios", "[id]", "edicao.tsx");
  const nucleo = fonte("src", "lib", "negocios-gravacao.ts");

  it("cadastro manda cidade e UF ao servidor e não exibe campos que não são gravados", () => {
    expect(formulario).toContain('name="contato_cidade"');
    expect(formulario).toContain('name="contato_uf"');
    for (const rotulo of ["Orientação", "Inclinação", "Área disponível"]) expect(formulario).not.toContain(rotulo);
  });

  it("fotos e documentos vão como anexo geral", () => {
    expect(formulario).not.toContain("anexo_fatura_beneficiario");
    expect(formulario.match(/name="anexo_geral"/g)).toHaveLength(2);
    expect(fonte("src", "lib", "anexos-regras.ts")).toMatch(/campo: "anexo_geral", categoria: "geral"/);
  });

  it("formulários não limpam o que foi digitado quando o servidor recusa", () => {
    // Cadastro e "Dados do negócio" têm envio próprio (arquivos direto ao Storage), também sem reset.
    for (const partes of [
      ["src", "app", "(app)", "negocios", "novo", "formulario.tsx"],
      ["src", "app", "(app)", "negocios", "[id]", "edicao.tsx"],
    ]) {
      const tela = fonte(...partes);
      expect(tela, partes.join("/")).toContain("evento.preventDefault()");
      expect(tela, partes.join("/")).toContain("onSubmit={enviar}");
      expect(tela, partes.join("/")).not.toContain("action={");
    }
    for (const partes of [
      ["src", "app", "(app)", "negocios", "[id]", "kit-personalizado.tsx"],
      ["src", "app", "(app)", "negocios", "[id]", "qualificacao.tsx"],
      ["src", "app", "(app)", "contatos", "[id]", "edicao.tsx"],
    ]) {
      const tela = fonte(...partes);
      expect(tela, partes.join("/")).toContain("useEnvioSemReset(acao)");
      expect(tela, partes.join("/")).toContain("onSubmit={enviar}");
    }
  });

  it("etapa saiu do formulário de edição e da gravação", () => {
    expect(edicao).not.toContain("etapa_id");
    const esquemaEdicao = nucleo.slice(nucleo.indexOf("const esquemaEdicao"), nucleo.indexOf("export async function editarNegocioComCliente"));
    expect(esquemaEdicao).not.toContain("etapa_id");
    const editar = nucleo.slice(nucleo.indexOf("export async function editarNegocioComCliente"), nucleo.indexOf("const esquemaKit"));
    expect(editar).not.toMatch(/etapa_id|status:/);
  });

  it("ficha marca arquivo registrado que não chegou ao Storage", () => {
    const ficha = fonte("src", "app", "(app)", "negocios", "[id]", "page.tsx");
    expect(ficha).toContain("anexosNaoRecebidos(supabase, negocio.empresa_id, id, anexos ?? [])");
    expect(ficha).toContain("naoRecebidos.has(a.id)");
  });

  it("kit reaberto traz o valor da conta salvo no cálculo", () => {
    const kit = fonte("src", "app", "(app)", "negocios", "[id]", "kit-personalizado.tsx");
    expect(kit).toContain("calculo ? calculo.valorFaturaMedio : valorFaturaMedioPadrao");
    expect(fonte("src", "app", "(app)", "negocios", "[id]", "page.tsx")).toMatch(/valorFaturaMedio: calculo\.valor_fatura_medio/);
  });

  it("endereço do contato é editável e aparece na ficha", () => {
    expect(fonte("src", "app", "(app)", "contatos", "[id]", "edicao.tsx")).toContain('name="endereco"');
    expect(fonte("src", "app", "(app)", "negocios", "[id]", "page.tsx")).toContain("contato.endereco");
  });

  it("ações delegam ao núcleo testado com banco", () => {
    expect(fonte("src", "lib", "acoes", "negocios.ts")).toMatch(/criarNegocioComCliente[\s\S]*editarNegocioComCliente/);
    expect(fonte("src", "lib", "acoes", "calculadora.ts")).toContain("salvarKitComCliente(supabase, atual, formData)");
    expect(fonte("src", "lib", "acoes", "contatos.ts")).toContain("editarContatoComCliente(supabase, formData)");
  });
});
