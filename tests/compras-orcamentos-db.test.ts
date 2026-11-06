/**
 * Compras, P2 (20261126100000_compras_orcamentos.sql): orçamentos e arquivos de compra da obra. Anexa quem escreve em
 * Compras na obra, depois do "Iniciar compra"; vê quem vê os pedidos. Orçamento edita e descarta enquanto não virou
 * pedido ativo; "Gerar pedido deste" liga o pedido ao orçamento; pedido cancelado libera o orçamento. Bucket próprio
 * (`compras-obra`) com planilha. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Orçamentos A/B" + sufixo, usuários "cpo-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato } from "./ajuda";

const BUCKET = "compras-obra";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let admin: Usuario;
let vendedor: Usuario;
let comprador: Usuario;
let compradorFora: Usuario;
let engenheiro: Usuario;
let operacional: Usuario;
let administrativo: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let obraB: string;
let orcamento1: string;
let orcamento2: string;
let pedido1: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const dia = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + n * 86400000));

async function criarObra(emp: string, resp: Usuario, confirmador: Usuario, titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: emp, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[resp.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(
    await servico.from("kit_componentes").insert([{ empresa_id: emp, negocio_id: neg!.id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 }]),
    "kit",
  );
  ok(await resp.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await resp.cliente.from("contratos").insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await resp.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function enviar(quem: Usuario, obraId: string, emp = empresa, tipo = "application/pdf", nome = "orcamento.pdf") {
  const caminho = `${emp}/${obraId}/${randomUUID()}-${nome}`;
  const { error } = await quem.cliente.storage.from(BUCKET).upload(caminho, new Blob(["conteudo de teste"], { type: tipo }), { contentType: tipo });
  return { caminho, error };
}

const DADOS = {
  p_fornecedor: "Distribuidora Solar Sul",
  p_valor: 13250,
  p_cobertura: "kit_completo",
  p_itens: "",
  p_condicao_pagamento: "28 dias",
  p_observacao: "",
};
const anexar = (quem: Usuario, obraId: string, caminho: string, extra: Partial<Record<string, unknown>> = {}) =>
  quem.cliente.rpc("anexar_orcamento_compra", {
    p_obra_id: obraId,
    ...DADOS,
    p_entrega_prevista: dia(8),
    p_valido_ate: dia(4),
    p_caminho: caminho,
    p_nome: "orcamento.pdf",
    ...extra,
  } as never);
const ITENS = [{ kit_indice: 0, descricao: "Módulo 550 W", unidade: "un", quantidade: 10, valor_unitario: 1300 }];
const criarPedido = (quem: Usuario, obraId: string, orcamentoId: string | null) =>
  quem.cliente.rpc("criar_pedido_compra", {
    p_obra_id: obraId,
    p_fornecedor: "Distribuidora Solar Sul",
    p_categoria: "equipamentos",
    p_entrega_prevista: dia(8),
    p_vencimento: dia(30),
    p_numero_fornecedor: null,
    p_frete: 0,
    p_itens: ITENS,
    ...(orcamentoId ? { p_orcamento_id: orcamentoId } : {}),
  } as never);
const orcamento = async (id: string) => (await servico.from("compras_orcamentos").select("*").eq("id", id).single()).data!;
const historico = async (obraId: string, tipo: string) =>
  (await servico.from("obra_historico").select("setor, dados").eq("obra_id", obraId).eq("tipo", tipo).order("id")).data ?? [];

describe("Compras: orçamentos e arquivos da obra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, comprador, compradorFora, engenheiro, operacional, administrativo, adminB] = await Promise.all(
      ["cpo-admin", "cpo-vendedor", "cpo-comprador", "cpo-comprador-fora", "cpo-engenheiro", "cpo-operacional", "cpo-administrativo", "cpo-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Orçamentos A ${sufixo}` }, { nome: `Orçamentos B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [comprador, empresa, { papel: "operacao" }],
      [compradorFora, empresa, { papel: "operacao" }],
      [engenheiro, empresa, { papel: "operacao" }],
      [operacional, empresa, { papel: "operacao" }],
      [administrativo, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, setor, capacidade] of [
      [comprador, "compras", "executar"],
      [compradorFora, "compras", "executar"],
      [engenheiro, "engenharia", "executar"],
      [operacional, "operacional", "coordenar"],
      [administrativo, "administrativo", "coordenar"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never }), "setor");
    }
    obra = await criarObra(empresa, vendedor, admin, "Orçamentos");
    obraB = await criarObra(empresaB, adminB, adminB, "Orçamentos B");
  });

  it("antes do Iniciar compra não se anexa orçamento", async () => {
    const { caminho, error } = await enviar(admin, obra);
    expect(error).toBeNull();
    expect((await anexar(admin, obra, caminho)).error?.message).toContain("Iniciar compra");
  });

  it("anexa orçamento com arquivo da pasta desta obra; valida os dados", async () => {
    ok(await comprador.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra }), "iniciar");
    const { caminho, error } = await enviar(comprador, obra);
    expect(error).toBeNull();
    expect((await anexar(comprador, obra, caminho, { p_valor: 0 })).error?.message).toContain("valor");
    expect((await anexar(comprador, obra, caminho, { p_cobertura: "parte", p_itens: "" })).error?.message).toContain("quais itens");
    expect((await anexar(comprador, obra, caminho, { p_valido_ate: null })).error?.message).toContain("vale");
    expect((await anexar(comprador, obra, `${empresa}/${obra}/${randomUUID()}-nao-existe.pdf`)).error?.message).toContain("não é desta obra");

    orcamento1 = ok(await anexar(comprador, obra, caminho), "orçamento 1").data as unknown as string;
    const o = await orcamento(orcamento1);
    expect(o.fornecedor).toBe("Distribuidora Solar Sul");
    expect(o.condicao_pagamento).toBe("28 dias");
    expect(o.observacao).toBeNull();
    expect(o.itens_descricao).toBeNull();
    // O mesmo arquivo não serve a dois orçamentos.
    expect((await anexar(comprador, obra, caminho)).error?.message).toContain("não é desta obra");

    const hist = await historico(obra, "orcamento_compra_anexado");
    expect(hist).toHaveLength(1);
    expect(JSON.stringify(hist[0].dados)).not.toContain("13250");
  });

  it("planilha .xlsx e .csv entram no bucket; outros tipos não", async () => {
    expect((await enviar(comprador, obra, empresa, XLSX, "orc.xlsx")).error).toBeNull();
    expect((await enviar(comprador, obra, empresa, "text/csv", "orc.csv")).error).toBeNull();
    expect((await enviar(comprador, obra, empresa, "application/zip", "orc.zip")).error).not.toBeNull();
    const planilha = await enviar(comprador, obra, empresa, XLSX, "parcial.xlsx");
    orcamento2 = ok(
      await anexar(comprador, obra, planilha.caminho, { p_fornecedor: "Ferragens Campinas", p_valor: 1120, p_cobertura: "parte", p_itens: "Estrutura e cabos", p_nome: "parcial.xlsx" }),
      "orçamento 2",
    ).data as unknown as string;
    expect((await orcamento(orcamento2)).itens_descricao).toBe("Estrutura e cabos");
  });

  it("só quem escreve em Compras na obra envia ao bucket e anexa", async () => {
    // Fora da obra (atua em Compras, mas não é o responsável), Engenharia, Operacional, vendedor e outra empresa.
    for (const quem of [compradorFora, engenheiro, operacional, vendedor, adminB]) {
      expect((await enviar(quem, obra)).error, quem.email).not.toBeNull();
    }
    const { caminho } = await enviar(comprador, obra);
    for (const quem of [compradorFora, engenheiro, operacional, vendedor, adminB]) {
      expect((await anexar(quem, obra, caminho)).error?.code, quem.email).toBe("42501");
    }
    // Pasta de outra empresa.
    expect((await enviar(adminB, obra, empresaB)).error).not.toBeNull();
    const { caminho: deB } = await enviar(adminB, obraB, empresaB);
    expect((await anexar(comprador, obra, deB)).error?.message).toContain("não é desta obra");
  });

  it("veem orçamentos e arquivos: Compras na obra, admin, Operacional e Administrativo; os demais não", async () => {
    for (const quem of [comprador, admin, operacional, administrativo]) {
      const { data } = await quem.cliente.from("compras_orcamentos").select("id").eq("obra_id", obra);
      expect(data, quem.email).toHaveLength(2);
      const { data: arquivos } = await quem.cliente.from("compras_arquivos").select("id").eq("obra_id", obra);
      expect(arquivos, quem.email).toHaveLength(2);
    }
    for (const quem of [vendedor, engenheiro, compradorFora, adminB]) {
      const { data } = await quem.cliente.from("compras_orcamentos").select("id").eq("obra_id", obra);
      expect(data, quem.email).toHaveLength(0);
    }
    const { data: arq } = await servico.from("compras_arquivos").select("caminho").eq("obra_id", obra).limit(1).single();
    expect((await operacional.cliente.storage.from(BUCKET).download(arq!.caminho)).error).toBeNull();
    expect((await engenheiro.cliente.storage.from(BUCKET).download(arq!.caminho)).error).not.toBeNull();
  });

  it("ninguém escreve direto nas tabelas", async () => {
    const r = await admin.cliente.from("compras_orcamentos").update({ valor_total: 1 }).eq("id", orcamento1).select("id");
    expect(r.error ?? r.data?.length === 0).toBeTruthy();
    expect(Number((await orcamento(orcamento1)).valor_total)).toBe(13250);
  });

  it("corrige o orçamento e descarta com motivo", async () => {
    ok(
      await comprador.cliente.rpc("editar_orcamento_compra", {
        p_orcamento_id: orcamento2,
        ...DADOS,
        p_fornecedor: "Ferragens Campinas",
        p_valor: 1180,
        p_cobertura: "parte",
        p_itens: "Estrutura, cabos e conectores",
        p_entrega_prevista: dia(5),
        p_valido_ate: dia(3),
      } as never),
      "editar",
    );
    const o = await orcamento(orcamento2);
    expect(Number(o.valor_total)).toBe(1180);
    expect(o.itens_descricao).toBe("Estrutura, cabos e conectores");
    expect((await comprador.cliente.rpc("descartar_orcamento_compra", { p_orcamento_id: orcamento2, p_motivo: "x" })).error?.message).toContain("motivo");
    ok(await comprador.cliente.rpc("descartar_orcamento_compra", { p_orcamento_id: orcamento2, p_motivo: "fornecedor desistiu" }), "descartar");
    expect((await orcamento(orcamento2)).descartado_em).not.toBeNull();
    expect((await comprador.cliente.rpc("descartar_orcamento_compra", { p_orcamento_id: orcamento2, p_motivo: "de novo" })).error?.message).toContain("descartado");
    expect((await criarPedido(comprador, obra, orcamento2)).error?.message).toContain("não está disponível");
    // O arquivo continua.
    expect((await servico.from("compras_arquivos").select("id").eq("id", (await orcamento(orcamento2)).arquivo_id)).data).toHaveLength(1);
  });

  it("Gerar pedido deste: liga o pedido ao orçamento, que deixa de ser editável; não gera dois pedidos", async () => {
    pedido1 = ok(await criarPedido(comprador, obra, orcamento1), "pedido do orçamento").data as unknown as string;
    expect((await orcamento(orcamento1)).pedido_id).toBe(pedido1);
    expect((await criarPedido(comprador, obra, orcamento1)).error?.message).toContain("já virou pedido");
    const editar = await comprador.cliente.rpc("editar_orcamento_compra", {
      p_orcamento_id: orcamento1,
      ...DADOS,
      p_entrega_prevista: dia(8),
      p_valido_ate: dia(4),
    } as never);
    expect(editar.error?.message).toContain("já virou pedido");
    // Orçamento de outra obra não liga.
    expect((await criarPedido(adminB, obraB, orcamento1)).error).not.toBeNull();
  });

  it("pedido cancelado libera o orçamento para gerar outro", async () => {
    ok(await comprador.cliente.rpc("cancelar_pedido_compra", { p_pedido_id: pedido1, p_motivo: "fornecedor sem estoque" }), "cancelar");
    const novo = ok(await criarPedido(comprador, obra, orcamento1), "novo pedido").data as unknown as string;
    expect((await orcamento(orcamento1)).pedido_id).toBe(novo);
    pedido1 = novo;
  });

  it("criar pedido sem orçamento continua funcionando", async () => {
    ok(await criarPedido(comprador, obra, null), "pedido sem orçamento");
  });

  it("confirmação do pedido e outro arquivo", async () => {
    const conf = await enviar(comprador, obra, empresa, "application/pdf", "confirmacao.pdf");
    const semPedido = await comprador.cliente.rpc("anexar_arquivo_compra", { p_obra_id: obra, p_tipo: "confirmacao", p_caminho: conf.caminho, p_nome: "confirmacao.pdf" });
    expect(semPedido.error?.message).toContain("pedido");
    ok(
      await comprador.cliente.rpc("anexar_arquivo_compra", {
        p_obra_id: obra,
        p_tipo: "confirmacao",
        p_caminho: conf.caminho,
        p_nome: "confirmacao.pdf",
        p_pedido_id: pedido1,
      }),
      "confirmação",
    );
    const outro = await enviar(comprador, obra, empresa, "image/png", "foto.png");
    ok(
      await comprador.cliente.rpc("anexar_arquivo_compra", {
        p_obra_id: obra,
        p_tipo: "outro",
        p_caminho: outro.caminho,
        p_nome: "foto.png",
        p_fornecedor: "Transportadora X",
      }),
      "outro",
    );
    const tipo = await enviar(comprador, obra);
    expect((await comprador.cliente.rpc("anexar_arquivo_compra", { p_obra_id: obra, p_tipo: "orcamento", p_caminho: tipo.caminho, p_nome: "o.pdf" })).error?.message).toContain(
      "tipo",
    );
    const { data: arquivos } = await servico.from("compras_arquivos").select("tipo, pedido_id, fornecedor").eq("obra_id", obra).order("created_at");
    expect(arquivos!.map((a) => a.tipo)).toEqual(["orcamento", "orcamento", "confirmacao", "outro"]);
    expect(arquivos![2].pedido_id).toBe(pedido1);
    expect(arquivos![3].fornecedor).toBe("Transportadora X");
    const hist = await historico(obra, "arquivo_compra_anexado");
    expect(hist.map((h) => (h.dados as { tipo: string }).tipo)).toEqual(["confirmacao", "outro"]);
  });
});
