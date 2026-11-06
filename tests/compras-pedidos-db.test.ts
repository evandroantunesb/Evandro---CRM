/**
 * Compras, P1 (20261125100000_compras_pedidos.sql): fila e "Iniciar compra" (quem atua em Compras assume a obra sem
 * responsável e a etapa vai para "Em cotação"), pedidos de compra com itens do kit, nota fiscal que cria a conta a
 * pagar, recebimento e o status de Compras andando sozinho (só para a frente). Empresa sem ninguém em Compras: o setor
 * escolhido pelo admin atende no lugar. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Compras A/B/C" + sufixo, usuários "cpp-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "financeiro-obra";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let comprador1: Usuario;
let comprador2: Usuario;
let operacional: Usuario;
let administrativo: Usuario;
let adminB: Usuario;
let adminC: Usuario;
let gestorC: Usuario;
let vendedorC: Usuario;
let administrativoC: Usuario;
let empresa: string;
let empresaC: string;
const membro: Record<string, string> = {};
let obra: string;
let pedido1: string;
let pedido2: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const dia = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + n * 86400000));
const pdf = () => new Blob(["%PDF-1.4 arquivo de teste"], { type: "application/pdf" });

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
    await servico.from("kit_componentes").insert([
      { empresa_id: emp, negocio_id: neg!.id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
      { empresa_id: emp, negocio_id: neg!.id, tipo: "inversor", descricao: "Inversor 5 kW", quantidade: 1, ordem: 1 },
    ]),
    "kit",
  );
  ok(await resp.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  const { data: contrato } = ok(
    await resp.cliente.from("contratos").insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await resp.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function enviar(quem: Usuario, obraId: string, emp = empresa) {
  const caminho = `${emp}/${obraId}/fornecedor/${randomUUID()}-nota.pdf`;
  const { error } = await quem.cliente.storage.from(BUCKET).upload(caminho, pdf(), { contentType: "application/pdf" });
  return { caminho, error };
}

const ITENS = [
  { kit_indice: 0, descricao: "Módulo 550 W", unidade: "un", quantidade: 10, valor_unitario: 780 },
  { kit_indice: 1, descricao: "Inversor 5 kW", unidade: "un", quantidade: 1, valor_unitario: 5900 },
];
const criar = (quem: Usuario, obraId: string, extra: Partial<Record<string, unknown>> = {}) =>
  quem.cliente.rpc("criar_pedido_compra", {
    p_obra_id: obraId,
    p_fornecedor: "Distribuidora Solar Sul",
    p_categoria: "equipamentos",
    p_entrega_prevista: dia(7),
    p_vencimento: dia(15),
    p_numero_fornecedor: null,
    p_frete: 120,
    p_itens: ITENS,
    ...extra,
  } as never);
const ver = async (quem: Usuario, obraId: string) => {
  const { data, error } = await quem.cliente.rpc("obras_operacao", { p_obra_id: obraId });
  if (error) throw error;
  return data ?? [];
};
const status = async (obraId: string) =>
  (await servico.from("obra_fluxos").select("status").eq("obra_id", obraId).eq("setor", "compras").single()).data!.status;
const pedido = async (id: string) => (await servico.from("compras_pedidos").select("*").eq("id", id).single()).data!;
const itens = async (id: string) => (await servico.from("compras_pedido_itens").select("*").eq("pedido_id", id).order("ordem")).data!;
const historico = async (obraId: string, tipo: string) =>
  (await servico.from("obra_historico").select("setor, dados").eq("obra_id", obraId).eq("tipo", tipo).order("id")).data ?? [];

describe("Compras: pedidos de compra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, comprador1, comprador2, operacional, administrativo, adminB, adminC, gestorC, vendedorC, administrativoC] =
      await Promise.all(
        [
          "cpp-admin", "cpp-gestor", "cpp-vendedor", "cpp-comprador1", "cpp-comprador2", "cpp-operacional", "cpp-administrativo",
          "cpp-admin-b", "cpp-admin-c", "cpp-gestor-c", "cpp-vendedor-c", "cpp-administrativo-c",
        ].map(criarUsuario),
      );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Compras A ${sufixo}` }, { nome: `Compras B ${sufixo}` }, { nome: `Compras C ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaC = empresas![2].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [comprador1, empresa, { papel: "operacao" }],
      [comprador2, empresa, { papel: "operacao" }],
      [operacional, empresa, { papel: "operacao" }],
      [administrativo, empresa, { papel: "operacao" }],
      [adminB, empresas![1].id, { papel: "admin" }],
      [adminC, empresaC, { papel: "admin" }],
      [gestorC, empresaC, { papel: "gestor" }],
      [vendedorC, empresaC, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [administrativoC, empresaC, { papel: "operacao" }],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, quemAdmin, setor, capacidade] of [
      [comprador1, admin, "compras", "executar"],
      [comprador2, admin, "compras", "executar"],
      [operacional, admin, "operacional", "coordenar"],
      [administrativo, admin, "administrativo", "coordenar"],
      [administrativoC, adminC, "administrativo", "executar"],
    ] as const) {
      ok(await quemAdmin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never }), "setor");
    }
    obra = await criarObra(empresa, vendedor, admin, "Compras");
  });

  it("a obra chega Aguardando Compras e aparece na fila de quem atua em Compras", async () => {
    expect(await status(obra)).toBe("a_comprar");
    expect(await ver(comprador1, obra)).toHaveLength(1);
    expect(await ver(comprador2, obra)).toHaveLength(1);
  });

  it("pedido só depois do Iniciar compra", async () => {
    expect((await criar(admin, obra)).error?.message).toContain("Iniciar compra");
  });

  it("só quem atua em Compras (ou admin, gestor, coordenador) inicia", async () => {
    for (const quem of [vendedor, adminB]) {
      expect((await quem.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra })).error?.code, quem.email).toBe("42501");
    }
  });

  it("quem inicia vira o responsável principal; a etapa vai para Em cotação e a obra sai da fila dos outros", async () => {
    ok(await comprador1.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra }), "iniciar");
    expect(await status(obra)).toBe("cotando");
    const { data: principais } = await servico
      .from("obra_participantes")
      .select("membro_id")
      .eq("obra_id", obra)
      .eq("setor", "compras")
      .eq("principal", true)
      .is("fim", null);
    expect(principais!.map((p) => p.membro_id)).toEqual([membro[comprador1.id]]);
    expect(await ver(comprador2, obra)).toHaveLength(0);
    const segundo = await comprador2.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra });
    expect(segundo.error).not.toBeNull();
    expect((await historico(obra, "participante_atribuido")).some((h) => (h.dados as { origem?: string }).origem === "iniciar_compra")).toBe(true);
  });

  it("valida os dados e os itens do pedido", async () => {
    expect((await criar(comprador1, obra, { p_fornecedor: "X" })).error?.message).toContain("fornecedor");
    expect((await criar(comprador1, obra, { p_categoria: "outra" })).error?.message).toContain("Categoria");
    expect((await criar(comprador1, obra, { p_itens: [] })).error?.message).toContain("ao menos um item");
    expect((await criar(comprador1, obra, { p_itens: [{ ...ITENS[0], kit_indice: 9 }] })).error?.message).toContain("kit");
    expect((await criar(comprador1, obra, { p_itens: [{ ...ITENS[0], quantidade: 0 }] })).error?.message).toContain("quantidade");
    expect((await criar(vendedor, obra)).error?.code).toBe("42501");
  });

  it("o 1º pedido leva a Pedido realizado, numera por empresa e acerta a previsão do material", async () => {
    pedido1 = ok(await criar(comprador1, obra), "pedido 1").data as unknown as string;
    const p = await pedido(pedido1);
    expect(p.numero).toBe(1);
    expect(Number(p.valor_total)).toBe(10 * 780 + 5900 + 120);
    expect(await status(obra)).toBe("pedido_realizado");
    expect((await itens(pedido1)).map((i) => i.kit_indice)).toEqual([0, 1]);
    const { data: o } = await servico.from("obras").select("entrega_material_prevista").eq("id", obra).single();
    expect(o!.entrega_material_prevista).toBe(dia(7));
    const hist = await historico(obra, "pedido_compra_criado");
    expect(JSON.stringify(hist)).not.toContain("13820");

    pedido2 = ok(
      await criar(comprador1, obra, {
        p_fornecedor: "Ferragens Campinas",
        p_categoria: "estrutura_materiais",
        p_entrega_prevista: dia(10),
        p_frete: 0,
        p_itens: [{ kit_indice: null, descricao: "Estrutura telhado cerâmico", unidade: "un", quantidade: 10, valor_unitario: 92 }],
      }),
      "pedido 2",
    ).data as unknown as string;
    expect((await pedido(pedido2)).numero).toBe(2);
    const { data: o2 } = await servico.from("obras").select("entrega_material_prevista").eq("id", obra).single();
    expect(o2!.entrega_material_prevista).toBe(dia(10));
  });

  it("edita antes da nota; quem vê os custos lê os pedidos, vendedor e outra empresa não", async () => {
    ok(
      await comprador1.cliente.rpc("editar_pedido_compra", {
        p_pedido_id: pedido2,
        p_fornecedor: "Ferragens Campinas",
        p_categoria: "estrutura_materiais",
        p_entrega_prevista: dia(10),
        p_vencimento: dia(20),
        p_numero_fornecedor: "48213",
        p_frete: 0,
        p_itens: [{ kit_indice: null, descricao: "Estrutura telhado cerâmico", unidade: "un", quantidade: 12, valor_unitario: 92 }],
      } as never),
      "editar",
    );
    expect(Number((await pedido(pedido2)).valor_total)).toBe(12 * 92);
    for (const quem of [operacional, administrativo, gestor, comprador1]) {
      const { data } = await quem.cliente.from("compras_pedidos").select("id").eq("obra_id", obra);
      expect(data, quem.email).toHaveLength(2);
    }
    for (const quem of [vendedor, adminB, comprador2]) {
      const { data } = await quem.cliente.from("compras_pedidos").select("id").eq("obra_id", obra);
      expect(data, quem.email).toHaveLength(0);
    }
  });

  it("a nota de um pedido cria a conta a pagar no valor da nota; a de todos leva a Faturado", async () => {
    const { caminho, error } = await enviar(comprador1, obra);
    expect(error).toBeNull();
    expect((await enviar(vendedor, obra)).error).not.toBeNull();
    const conta1 = ok(
      await comprador1.cliente.rpc("registrar_nf_pedido_compra", {
        p_pedido_id: pedido1, p_nf_numero: "001.245", p_nf_valor: 13700, p_caminho: caminho, p_nome: "nota.pdf",
      }),
      "nf 1",
    ).data as unknown as string;
    const { data: c } = await servico.from("obra_contas_pagar").select("*").eq("id", conta1).single();
    expect(Number(c!.valor)).toBe(13700);
    expect(c!.fornecedor).toBe("Distribuidora Solar Sul");
    expect(c!.vencimento).toBe(dia(15));
    expect(c!.nf_caminho).toBe(caminho);
    expect(await status(obra)).toBe("pedido_realizado");

    expect(
      (await comprador1.cliente.rpc("editar_pedido_compra", {
        p_pedido_id: pedido1, p_fornecedor: "Distribuidora Solar Sul", p_categoria: "equipamentos", p_entrega_prevista: dia(7),
        p_vencimento: dia(15), p_numero_fornecedor: null, p_frete: 0, p_itens: ITENS,
      } as never)).error?.message,
    ).toContain("nota fiscal");
    expect((await comprador1.cliente.rpc("cancelar_pedido_compra", { p_pedido_id: pedido1, p_motivo: "teste" })).error?.message).toContain("nota fiscal");

    const segundo = await enviar(comprador1, obra);
    ok(
      await comprador1.cliente.rpc("registrar_nf_pedido_compra", {
        p_pedido_id: pedido2, p_nf_numero: "7.731", p_nf_valor: 1104, p_caminho: segundo.caminho, p_nome: "nota.pdf",
      }),
      "nf 2",
    );
    expect(await status(obra)).toBe("faturado_fornecedor");
    const { data: tarefas } = await servico.from("tarefas_setor").select("titulo").eq("obra_id", obra);
    expect(tarefas!.map((t) => t.titulo)).toContain("Pagar fornecedor");
  });

  it("recebimento parcial não muda o status; tudo recebido leva a Material entregue", async () => {
    const [modulo, inversor] = await itens(pedido1);
    expect(
      (await comprador1.cliente.rpc("registrar_recebimento_pedido_compra", { p_pedido_id: pedido1, p_itens: [{ item_id: modulo.id, quantidade: 11 }] })).error
        ?.message,
    ).toContain("Chegou mais");
    ok(await comprador1.cliente.rpc("registrar_recebimento_pedido_compra", { p_pedido_id: pedido1, p_itens: [{ item_id: modulo.id, quantidade: 4 }] }), "parcial");
    expect(Number((await itens(pedido1))[0].quantidade_recebida)).toBe(4);
    expect(await status(obra)).toBe("faturado_fornecedor");
    ok(
      await comprador1.cliente.rpc("registrar_recebimento_pedido_compra", {
        p_pedido_id: pedido1, p_itens: [{ item_id: modulo.id, quantidade: 6 }, { item_id: inversor.id, quantidade: 1 }],
      }),
      "resto 1",
    );
    const [estrutura] = await itens(pedido2);
    ok(await comprador1.cliente.rpc("registrar_recebimento_pedido_compra", { p_pedido_id: pedido2, p_itens: [{ item_id: estrutura.id, quantidade: 12 }] }), "resto 2");
    expect(await status(obra)).toBe("material_entregue");
  });

  it("conta do pedido cancelada no Financeiro devolve o pedido a aguardando nota, sem voltar o status", async () => {
    const { conta_id } = await pedido(pedido2);
    ok(await administrativo.cliente.rpc("cancelar_conta_pagar", { p_conta_id: conta_id!, p_motivo: "Nota com valor errado" }), "cancelar conta");
    const p = await pedido(pedido2);
    expect(p.conta_id).toBeNull();
    expect(p.nf_registrada_em).toBeNull();
    expect(await historico(obra, "pedido_compra_nf_desfeita")).toHaveLength(1);
    expect(await status(obra)).toBe("material_entregue");
  });

  it("empresa sem ninguém em Compras: só depois de o admin escolher, o setor escolhido atende", async () => {
    const obraC = await criarObra(empresaC, vendedorC, adminC, "Compras C");
    expect(await ver(administrativoC, obraC)).toHaveLength(0);
    expect((await administrativoC.cliente.rpc("iniciar_compra_obra", { p_obra_id: obraC })).error?.code).toBe("42501");

    expect((await gestorC.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresaC, p_setor: "administrativo" })).error?.code).toBe("42501");
    expect((await adminC.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresaC, p_setor: "engenharia" })).error).not.toBeNull();
    ok(await adminC.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresaC, p_setor: "administrativo" }), "definir");

    expect(await ver(administrativoC, obraC)).toHaveLength(1);
    ok(await administrativoC.cliente.rpc("iniciar_compra_obra", { p_obra_id: obraC }), "iniciar C");
    expect(await status(obraC)).toBe("cotando");
    ok(await criar(administrativoC, obraC), "pedido C");
    const { data: pedC } = await servico.from("compras_pedidos").select("numero").eq("obra_id", obraC).single();
    expect(pedC!.numero).toBe(1);
  });
});
