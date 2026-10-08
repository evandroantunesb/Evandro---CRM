/**
 * Gravação do negócio (parte pura): endereço do contato, complemento de contato existente,
 * avisos de gravação parcial e regressões de tela (campos sem envio, reset ao recusar,
 * categoria de anexos, etapa fora da edição). O ciclo com banco fica em negocios-gravacao-db.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  arquivosEscolhidos,
  LIMITE_ANEXO,
  nomeDoObjeto,
  nomeSeguro,
  objetoConfereComNome,
  prepararEnvioCriacao,
  problemaArquivo,
} from "@/lib/anexos-regras";
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

  it("nome legível de arquivo no Storage tira o prefixo uuid", () => {
    expect(nomeDoObjeto("0f8fad5b-d9cb-469f-a165-70867728950e-conta-luz.pdf")).toBe("conta-luz.pdf");
    expect(nomeDoObjeto("sem-prefixo.pdf")).toBe("sem-prefixo.pdf");
  });

  it("envio do navegador registra só depois de o arquivo chegar (linha do tempo fiel)", () => {
    const envio = fonte("src", "lib", "anexos-navegador.ts");
    expect(envio.indexOf(".upload(")).toBeGreaterThan(-1);
    expect(envio.indexOf(".upload(")).toBeLessThan(envio.indexOf("await registrar("));
    expect(fonte("src", "lib", "negocios-gravacao.ts")).not.toMatch(/from\("anexos"\)/);
  });

  it("objeto do Storage só confere com o nome que o gerou", () => {
    const objeto = nomeSeguro("Conta de Luz ção.pdf");
    expect(objetoConfereComNome(objeto, "Conta de Luz ção.pdf")).toBe(true);
    expect(objetoConfereComNome(objeto, "outra.pdf")).toBe(false);
    expect(objetoConfereComNome("sem-uuid-conta.pdf", "conta.pdf")).toBe(false);
    expect(objetoConfereComNome("0f8fad5b-d9cb-469f-a165-70867728950e-orfao.pdf", nomeDoObjeto("0f8fad5b-d9cb-469f-a165-70867728950e-orfao.pdf"))).toBe(true);
  });

  it("registrarAnexo confere o objeto no Storage e não apaga arquivo quando a gravação falha", () => {
    const acao = fonte("src", "lib", "acoes", "anexos.ts");
    const registrar = acao.slice(acao.indexOf("export async function registrarAnexo"), acao.indexOf("export async function apagarAnexo"));
    expect(registrar).toMatch(/localizarObjeto\(supabase, pasta, objeto\)[\s\S]*from\("anexos"\)\.insert/);
    expect(registrar).toContain("tamanho: real.tamanho");
    expect(registrar).not.toMatch(/criarClienteAdmin|\.remove\(/);
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
    expect(formulario).toContain("enviarArquivos(");
    expect(edicao).toContain('formulario.delete("anexo_fatura_energia")');
    expect(edicao).toContain("enviarArquivos(");
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

  it("cadastro: Salvar nunca fica mudo (obrigatório escondido em outro passo, erro do servidor, contato não escolhido)", () => {
    // Sem a validação automática do navegador, que bloqueava o envio sem mensagem quando o campo
    // obrigatório estava num passo escondido; cada passo é conferido e o erro aparece no passo dele.
    expect(formulario).toContain("<form onSubmit={enviar} noValidate");
    const enviar = formulario.slice(formulario.indexOf("function enviar("), formulario.indexOf("function pesquisar("));
    expect(enviar.indexOf("for (const etapa of [1, 2, 3] as const)")).toBeLessThan(enviar.indexOf("prepararEnvioCriacao("));
    expect(enviar).toMatch(/try \{\s*r = await criarNegocio\(dados\);\s*\} catch/);
    expect(formulario).toContain('<Botao type="submit" disabled={pendente}>');
    // A mensagem do passo também aparece no passo 3.
    const passo3 = formulario.slice(formulario.indexOf("etapasRef.current[3] = el"));
    expect(passo3).toContain("{erroEtapa && <Mensagem");
  });

  it("cadastro: Avançar confere só os campos do passo atual, sem exigência nova", () => {
    const problema = formulario.slice(formulario.indexOf("function problemaDaEtapa("), formulario.indexOf("function mostrarProblema("));
    expect(problema).toContain("campoInvalido(etapa)");
    expect(formulario).toContain("etapasRef.current[etapa]");
    // Os obrigatórios continuam os mesmos de antes: nome do negócio e origem (passo 1) e valor (passo 2).
    expect(formulario.match(/\brequired\b/g)?.length).toBe(7);
  });

  it("cadastro: Cancelar montagem fecha o editor e descarta só os itens; valor digitado fica", () => {
    const inicio = formulario.indexOf("function cancelarMontagem(");
    const cancelar = formulario.slice(inicio, formulario.indexOf("\n  }\n", inicio));
    expect(cancelar).toContain("setLinhas([])");
    expect(cancelar).toContain("setMostrarKit(false)");
    // Só o valor que veio da sugestão automática é limpo.
    expect(cancelar).toContain('if (!valorTocado) setValor("")');
    // Cliente, consumo, localização e valor digitado não são tocados.
    expect(cancelar).not.toMatch(/setContato|setConsumoMedioKwh|setValorFaturaMedio|setCidade|setUf|setRua|setCep|setValorTocado/);
    expect(formulario).toContain("onClick={cancelarMontagem}");
    expect(formulario).toContain("Cancelar montagem");
    expect(formulario).not.toContain("Desistir do kit");
  });

  it("cadastro: passo 2 tem um botão só para seguir, que vira 'Continuar sem kit' sem kit em montagem", () => {
    expect(formulario.match(/onClick=\{avancar\}/g)).toHaveLength(2); // passo 1 e passo 2
    expect(formulario).toContain('{mostrarKit || componentes.length ? "Avançar" : "Continuar sem kit"}');
    expect(formulario).toContain("Montar kit manualmente");
    // Sugestão automática do valor continua, sempre identificada como estimativa.
    expect(formulario).toContain("estimativa, não é cotação real");
    expect(formulario).toContain("Estimativa ilustrativa: não é salva no negócio.");
  });

  it("etapa saiu do formulário de edição e da gravação", () => {
    expect(edicao).not.toContain("etapa_id");
    const esquemaEdicao = nucleo.slice(nucleo.indexOf("const esquemaEdicao"), nucleo.indexOf("export async function editarNegocioComCliente"));
    expect(esquemaEdicao).not.toContain("etapa_id");
    const editar = nucleo.slice(nucleo.indexOf("export async function editarNegocioComCliente"), nucleo.indexOf("const esquemaKit"));
    expect(editar).not.toMatch(/etapa_id|status:/);
  });

  it("ficha confere o Storage e avisa quando não conseguiu conferir", () => {
    const ficha = fonte("src", "app", "(app)", "negocios", "[id]", "page.tsx");
    expect(ficha).toContain("conferirArquivos(supabase, negocio.empresa_id, id, anexos ?? [])");
    expect(ficha).toContain("!conferencia.conferido");
    expect(ficha).toContain("<RegistrarArquivo");
  });

  it("ficha: Cancelar na edição do kit não grava nada e volta ao que está salvo", () => {
    const kit = fonte("src", "app", "(app)", "negocios", "[id]", "kit-personalizado.tsx");
    const inicio = kit.indexOf("function cancelarEdicao(");
    const cancelar = kit.slice(inicio, kit.indexOf("\n  }\n", inicio));
    expect(cancelar).not.toMatch(/\bacao\(|\benviar\(|salvarKitPersonalizado/);
    expect(cancelar).toContain("setLinhas(linhasSalvas())");
    expect(cancelar).toContain("setTarifaKwh(");
    expect(kit).toContain('<Botao type="button" variante="secundario" onClick={cancelarEdicao}>');
  });

  it("ficha: remover kit salvo pede confirmação; com cálculo, a tela explica a recusa", () => {
    const kit = fonte("src", "app", "(app)", "negocios", "[id]", "kit-personalizado.tsx");
    expect(kit).toContain("const removendoKitSalvo = componentesSalvos.length > 0 && componentes.length === 0;");
    expect(kit).toContain('name="confirmarRemocao"');
    expect(kit).toContain("disabled={pendente || (removendoKitSalvo && (!!calculo || !confirmaRemocao))}");
    expect(kit).toContain("{MENSAGEM_REMOCAO_COM_CALCULO}");
    expect(kit).toContain('"Remover kit salvo"');
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
