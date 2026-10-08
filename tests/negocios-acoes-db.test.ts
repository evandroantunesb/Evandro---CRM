/**
 * Caminho real das telas, com Supabase local (roda no CI): as Server Actions de verdade
 * (`criarNegocio`, `editarNegocio`, `reservarAnexos`, `apagarAnexo`, `salvarKitPersonalizado`,
 * `editarContato`) recebendo o mesmo FormData que o formulário monta (`prepararEnvioCriacao`),
 * e o envio dos arquivos como o navegador faz (`enviarArquivosReservados`, direto ao Storage,
 * com o cliente do usuário). Só a sessão é substituída: `exigirPapel` devolve o membro do teste
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

const { apagarAnexo, reservarAnexos } = await import("@/lib/acoes/anexos");
const { salvarKitPersonalizado } = await import("@/lib/acoes/calculadora");
const { editarContato } = await import("@/lib/acoes/contatos");
const { criarNegocio, editarNegocio } = await import("@/lib/acoes/negocios");
const { enviarArquivosReservados } = await import("@/lib/anexos-navegador");
const { prepararEnvioCriacao } = await import("@/lib/anexos-regras");
const { anexosNaoRecebidos } = await import("@/lib/anexos-servidor");
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
    const falhas = await enviarArquivosReservados(
      vendedor.cliente,
      r.reservas.map((reserva, i) => ({ caminho: reserva.caminho, arquivo: arquivos[i].arquivo })),
    );
    expect(falhas).toEqual([]);

    const lista = await registros(r.negocioId);
    expect(lista.map((a) => [a.nome, a.categoria])).toEqual([
      ["fatura.pdf", "fatura_gerador"],
      ["foto.jpg", "geral"],
    ]);
    expect((await anexosNaoRecebidos(vendedor.cliente as never, empresa, r.negocioId, lista)).size).toBe(0);
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
  });

  it("envio interrompido fica identificável ao reabrir e pode ser refeito", async () => {
    const { dados, arquivos } = prepararEnvioCriacao(
      formularioCadastro({ anexo_geral: [arquivo("a.png", 1024), arquivo("b.png", 1024)] }),
    );
    const r = await criarNegocio(dados);
    if (!r.ok) throw new Error(r.mensagem);
    // O navegador fechou depois do primeiro arquivo.
    await enviarArquivosReservados(vendedor.cliente, [{ caminho: r.reservas[0].caminho, arquivo: arquivos[0].arquivo }]);

    // Reabrindo a ficha (outra sessão, sem aviso na URL): o segundo aparece como não recebido.
    let lista = await registros(r.negocioId);
    const pendentes = await anexosNaoRecebidos(vendedor.cliente as never, empresa, r.negocioId, lista);
    expect([...pendentes]).toEqual([lista.find((a) => a.nome === "b.png")!.id]);

    // Recuperação pela tela: remove o pendente e envia de novo (reserva + Storage).
    const remover = new FormData();
    remover.append("anexoId", [...pendentes][0]);
    await apagarAnexo(remover);
    const reserva = await reservarAnexos(r.negocioId, [{ nome: "b.png", tamanho: 1024, tipoMime: "image/png", categoria: "geral" }]);
    if (!reserva.ok) throw new Error(reserva.mensagem);
    expect(await enviarArquivosReservados(vendedor.cliente, [{ caminho: reserva.reservas[0].caminho, arquivo: arquivo("b.png", 1024) }])).toEqual([]);

    lista = await registros(r.negocioId);
    expect(lista.map((a) => a.nome)).toEqual(["a.png", "b.png"]);
    expect((await anexosNaoRecebidos(vendedor.cliente as never, empresa, r.negocioId, lista)).size).toBe(0);
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
    const reserva = await reservarAnexos(r.negocioId, [{ nome: fatura.name, tamanho: fatura.size, tipoMime: fatura.type, categoria: "fatura_gerador" }]);
    if (!reserva.ok) throw new Error(reserva.mensagem);
    expect(await enviarArquivosReservados(vendedor.cliente, [{ caminho: reserva.reservas[0].caminho, arquivo: fatura }])).toEqual([]);

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
    expect((await anexosNaoRecebidos(vendedor.cliente as never, empresa, r.negocioId, lista)).size).toBe(0);
  });

  it("papel fora da lista não usa as ações (mesma checagem da sessão real)", async () => {
    const antes = sessao.atual;
    sessao.atual = { ...antes, papel: "operacao" };
    await expect(criarNegocio(prepararEnvioCriacao(formularioCadastro({})).dados)).rejects.toThrow("sem permissão");
    sessao.atual = antes;
  });
});
