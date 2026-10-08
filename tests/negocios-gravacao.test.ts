/**
 * Gravação do negócio (parte pura): endereço do contato, complemento de contato existente,
 * avisos de gravação parcial e regressões de tela (campos sem envio, reset ao recusar,
 * categoria de anexos, etapa fora da edição). O ciclo com banco fica em negocios-gravacao-db.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    expect(nucleo).toMatch(/campo: "anexo_geral", categoria: "geral"/);
  });

  it("formulários não limpam o que foi digitado quando o servidor recusa", () => {
    for (const partes of [
      ["src", "app", "(app)", "negocios", "novo", "formulario.tsx"],
      ["src", "app", "(app)", "negocios", "[id]", "edicao.tsx"],
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
