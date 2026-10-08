/**
 * Caminho real das telas, com Supabase local (roda no CI): as Server Actions de verdade
 * (`criarNegocio`, `editarNegocio`, `registrarAnexo`, `apagarAnexo`, `salvarKitPersonalizado`,
 * `editarContato`) recebendo o mesmo FormData que o formulário monta (`prepararEnvioCriacao`),
 * e o envio dos arquivos como o navegador faz (`enviarArquivos`: direto ao Storage com o
 * cliente do usuário e, só depois, `registrarAnexo`). Só a sessão é substituída: `exigirPapel` devolve o membro do teste
 * (e recusa papel fora da lista, como o real) e `criarClienteServidor` devolve o cliente dele.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Usuario } from "./ajuda";

const sessao = vi.hoisted(() => ({
  usuario: null as unknown as { cliente: unknown },
  atual: null as unknown as { empresaId: string; membroId: string; papel: string },
}));

vi.mock("@/lib/sessao", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(sessao.atual.papel)) throw new Error("sem permissão");
    return { atual: sessao.atual };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => sessao.usuario.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const { apagarAnexo, registrarAnexo } = await import("@/lib/acoes/anexos");
const { salvarKitPersonalizado } = await import("@/lib/acoes/calculadora");
const { editarContato } = await import("@/lib/acoes/contatos");
const { criarNegocio, editarNegocio } = await import("@/lib/acoes/negocios");
const { enviarArquivos } = await import("@/lib/anexos-navegador");
const { ANEXOS_CRIACAO, prepararEnvioCriacao } = await import("@/lib/anexos-regras");
const { conferirArquivos } = await import("@/lib/anexos-servidor");
const { criarUsuario, servico, sufixo } = await import("./ajuda");

let vendedor: Usuario;
let empresa: string;
let funil: string;
let membroVendedor: string;

beforeAll(async () => {
  vendedor = await criarUsuario("na-vendedor");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Ações ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: m, error } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" })
    .select("id")
    .single();
  if (error) throw error;
  membroVendedor = m!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  sessao.usuario = vendedor;
  sessao.atual = { empresaId: empresa, membroId: membroVendedor, papel: "vendedor" };
});

const MB = 1024 * 1024;
const arquivo = (nome: string, bytes: number, tipo = "image/png") => new File([new Uint8Array(bytes)], nome, { type: tipo });

/** FormData como o `<form>` do cadastro produz (inclui o arquivo vazio que o navegador manda sem escolha). */
function formularioCadastro(arquivos: Record<string, File[]>) {
  const f = new FormData();
  const campos: Record<string, string> = {
    funil_id: funil,
    titulo: `Pela tela ${Math.random().toString(36).slice(2, 7)}`,
    origem_id: "",
    valor: "30.000,00",
    contato_tipo: "pf",
    contato_nome: `Cliente tela ${Math.random().toString(36).slice(2, 7)}`,
    contato_telefone: "(45) 99999-2222",
    contato_email: "",
    contato_endereco: "Rua A, 10",
    contato_cidade: "Cascavel",
    contato_uf: "PR",
    tipo_ligacao: "trifasico",
    componentes: "[]",
    tarifa_kwh: "",
    consumo_medio_kwh: "450",
    valor_fatura_medio: "",
  };
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  for (const campo of ["anexo_cnh_contato", "anexo_fatura_gerador", "anexo_geral"]) {
    const lista = arquivos[campo] ?? [new File([], "", { type: "application/octet-stream" })];
    for (const a of lista) f.append(campo, a);
  }
  return f;
}

async function registros(negocioId: string) {
  const { data } = await vendedor.cliente.from("anexos").select("id, caminho, nome, categoria").eq("negocio_id", negocioId).order("nome");
  return data ?? [];
}

const categoria = (campo: string) => ANEXOS_CRIACAO.find((c) => c.campo === campo)!.categoria;

/** O que a tela faz depois de criar: envia cada arquivo ao Storage e só então registra. */
async function enviarComoATela(r: { negocioId: string; empresaId: string }, arquivos: { campo: string; arquivo: File }[]) {
  return enviarArquivos(
    vendedor.cliente,
    registrarAnexo,
    { empresaId: r.empresaId, negocioId: r.negocioId },
    arquivos.map((a) => ({ arquivo: a.arquivo, categoria: categoria(a.campo) })),
  );
}

async function conferir(negocioId: string) {
  const c = await conferirArquivos(vendedor.cliente as never, empresa, negocioId, await registros(negocioId));
  if (!c.conferido) throw new Error("não conferido");
  return c;
}

describe("cadastro pela tela", () => {
  it("arquivos acima de 1 MB chegam: a ação recebe só os dados deles e o conteúdo vai direto ao Storage", async () => {
    const { dados, arquivos, problema } = prepararEnvioCriacao(
      formularioCadastro({ anexo_geral: [arquivo("foto.jpg", 3 * MB, "image/jpeg")], anexo_fatura_gerador: [arquivo("fatura.pdf", 2 * MB, "application/pdf")] }),
    );
    expect(problema).toBeNull();
    // Nada de arquivo no corpo da Server Action (limite padrão de 1 MB).
    const corpo = [...dados.values()];
    expect(corpo.some((v) => v instanceof File)).toBe(false);
    expect(corpo.reduce((t, v) => t + String(v).length, 0)).toBeLessThan(10_000);

    const r = await criarNegocio(dados);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toEqual([]);
    expect(await enviarComoATela(r, arquivos)).toEqual([]);

    const lista = await registros(r.negocioId);
    expect(lista.map((a) => [a.nome, a.categoria])).toEqual([
      ["fatura.pdf", "fatura_gerador"],
      ["foto.jpg", "geral"],
    ]);
    const c = await conferir(r.negocioId);
    expect(c.semRegistro).toEqual([]);
    expect(c.semArquivo.size).toBe(0);
    // Linha do tempo: um "anexo adicionado" por arquivo que chegou, nenhum antes disso.
    const { count } = await servico
      .from("atividades")
      .select("id", { count: "exact", head: true })
      .eq("negocio_id", r.negocioId)
      .eq("tipo", "anexo_adicionado");
    expect(count).toBe(2);
    const { data: contato } = await vendedor.cliente.from("negocios").select("contatos(endereco, cidade, uf)").eq("id", r.negocioId).single();
    expect(contato!.contatos).toEqual({ endereco: "Rua A, 10", cidade: "Cascavel", uf: "PR" });
  });

  it("arquivo vazio escolhido pelo usuário é apontado antes de enviar; o servidor também recusa", async () => {
    const formulario = formularioCadastro({ anexo_cnh_contato: [new File([], "cnh.png", { type: "image/png" })] });
    const { dados, problema } = prepararEnvioCriacao(formulario);
    expect(problema).toContain("cnh.png");
    // Mesmo que a tela fosse contornada, a ação recusa sem criar o negócio.
    const r = await criarNegocio(dados);
    expect(r.ok).toBe(false);
    const { count } = await servico.from("negocios").select("id", { count: "exact", head: true }).eq("titulo", String(formulario.get("titulo")));
    expect(count).toBe(0);
    // O registro também recusa arquivo vazio.
    const n = await criarNegocio(prepararEnvioCriacao(formularioCadastro({})).dados);
    if (!n.ok) throw new Error(n.mensagem);
    expect(
      await registrarAnexo({ negocioId: n.negocioId, caminho: `${empresa}/${n.negocioId}/x-vazio.png`, nome: "vazio.png", tamanho: 0, tipoMime: "image/png" }),
    ).toMatchObject({ ok: false });
  });

  it("envio interrompido entre o Storage e o registro fica visível ao reabrir e é registrado pela ficha", async () => {
    const { dados, arquivos } = prepararEnvioCriacao(formularioCadastro({ anexo_geral: [arquivo("a.png", 1024), arquivo("b.png", 2048)] }));
    const r = await criarNegocio(dados);
    if (!r.ok) throw new Error(r.mensagem);
    // O navegador enviou e registrou "a"; enviou "b" e fechou antes de registrar.
    expect(await enviarComoATela(r, [arquivos[0]])).toEqual([]);
    const caminhoB = `${empresa}/${r.negocioId}/00000000-0000-4000-8000-000000000000-b.png`;
    expect((await vendedor.cliente.storage.from("anexos").upload(caminhoB, arquivos[1].arquivo)).error).toBeNull();

    // Reabrindo a ficha (sem aviso na URL): "b" aparece como recebido sem registro.
    let c = await conferir(r.negocioId);
    expect(c.semRegistro).toEqual([{ caminho: caminhoB, nome: "b.png", tamanho: 2048, tipoMime: "image/png" }]);

    // Botão "Registrar" da ficha.
    expect(await registrarAnexo({ negocioId: r.negocioId, ...c.semRegistro[0], categoria: "geral" })).toMatchObject({ ok: true });
    c = await conferir(r.negocioId);
    expect(c.semRegistro).toEqual([]);
    expect((await registros(r.negocioId)).map((a) => a.nome)).toEqual(["a.png", "b.png"]);
  });

  it("registro e exclusão respeitam empresa e autoria", async () => {
    const r = await criarNegocio(prepararEnvioCriacao(formularioCadastro({})).dados);
    if (!r.ok) throw new Error(r.mensagem);
    expect(await enviarComoATela(r, [{ campo: "anexo_geral", arquivo: arquivo("doc.png", 64) }])).toEqual([]);
    const [doc] = await registros(r.negocioId);

    // Sessão de outra empresa: caminho fora da pasta dela é recusado antes de gravar.
    const antes = sessao.atual;
    sessao.atual = { ...antes, empresaId: crypto.randomUUID() };
    expect(await registrarAnexo({ negocioId: r.negocioId, caminho: doc.caminho, nome: "doc.png", tamanho: 64, tipoMime: "image/png" })).toEqual({
      ok: false,
      mensagem: "Dados do arquivo inválidos.",
    });
    sessao.atual = antes;

    // Apagar pela ação: o banco decide (autor ou admin); só então o arquivo sai do Storage.
    const remover = new FormData();
    remover.append("anexoId", doc.id);
    await apagarAnexo(remover);
    expect(await registros(r.negocioId)).toEqual([]);
    expect((await conferir(r.negocioId)).semRegistro).toEqual([]);
  });
});

describe("ficha pela tela", () => {
  it("editar dados + fatura acima de 1 MB; kit e contato pelas ações; reabrir preserva tudo", async () => {
    const { dados } = prepararEnvioCriacao(formularioCadastro({}));
    const r = await criarNegocio(dados);
    if (!r.ok) throw new Error(r.mensagem);

    // "Dados do negócio": a ação recebe o formulário sem o arquivo; a fatura vai depois, direto.
    const edicao = new FormData();
    for (const [k, v] of Object.entries({
      negocioId: r.negocioId,
      titulo: "Editado pela tela",
      origem_id: "",
      valor: "31.000,00",
      valor_conta_energia: "320,00",
      consumo_medio_kwh: "450",
      unidade_consumidora: "UC-9",
      padrao_cliente: "",
      tipo_telhado: "metálico",
      descricao: "",
    }))
      edicao.append(k, v);
    expect(await editarNegocio(null, edicao)).toEqual({ ok: true, mensagem: "Salvo." });
    const fatura = arquivo("fatura.pdf", 2 * MB, "application/pdf");
    expect(
      await enviarArquivos(vendedor.cliente, registrarAnexo, { empresaId: r.empresaId, negocioId: r.negocioId }, [{ arquivo: fatura, categoria: "fatura_gerador" }]),
    ).toEqual([]);

    const kit = new FormData();
    for (const [k, v] of Object.entries({
      negocioId: r.negocioId,
      tipoLigacao: "trifasico",
      consumoMedioKwh: "450",
      valorFaturaMedio: "320,00",
      tarifaKwh: "0,95",
      estruturaTelhado: "trilho",
      componentes: JSON.stringify([{ tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 10 }]),
      observacoes: "",
    }))
      kit.append(k, v);
    expect(await salvarKitPersonalizado(null, kit)).toEqual({ ok: true, mensagem: "Kit e cálculo salvos." });

    const { data: n } = await vendedor.cliente
      .from("negocios")
      .select("titulo, valor, valor_conta_energia, unidade_consumidora, tipo_telhado, estrutura_telhado, contato_id")
      .eq("id", r.negocioId)
      .single();
    expect(n).toMatchObject({ titulo: "Editado pela tela", valor: 31000, valor_conta_energia: 320, unidade_consumidora: "UC-9", tipo_telhado: "metálico", estrutura_telhado: "trilho" });

    const contato = new FormData();
    for (const [k, v] of Object.entries({
      contatoId: n!.contato_id,
      tipo: "pf",
      nome: "Cliente editado",
      telefone: "(45) 99999-2222",
      telefone2: "",
      email: "",
      documento: "123.456.789-09",
      endereco: "Rua Nova, 1",
      cidade: "Cascavel",
      uf: "PR",
    }))
      contato.append(k, v);
    expect(await editarContato(null, contato)).toEqual({ ok: true, mensagem: "Contato salvo." });

    const [{ data: c }, { data: calc }, lista] = await Promise.all([
      vendedor.cliente.from("contatos").select("nome, documento, endereco, cidade, uf").eq("id", n!.contato_id).single(),
      vendedor.cliente.from("calculos_solares").select("valor_fatura_medio, tarifa_kwh").eq("negocio_id", r.negocioId).single(),
      registros(r.negocioId),
    ]);
    expect(c).toEqual({ nome: "Cliente editado", documento: "123.456.789-09", endereco: "Rua Nova, 1", cidade: "Cascavel", uf: "PR" });
    expect(calc).toEqual({ valor_fatura_medio: 320, tarifa_kwh: 0.95 });
    expect(lista.map((a) => [a.nome, a.categoria])).toEqual([["fatura.pdf", "fatura_gerador"]]);
    expect((await conferir(r.negocioId)).semRegistro).toEqual([]);
  });

  it("papel fora da lista não usa as ações (mesma checagem da sessão real)", async () => {
    const antes = sessao.atual;
    sessao.atual = { ...antes, papel: "operacao" };
    await expect(criarNegocio(prepararEnvioCriacao(formularioCadastro({})).dados)).rejects.toThrow("sem permissão");
    sessao.atual = antes;
  });
});
