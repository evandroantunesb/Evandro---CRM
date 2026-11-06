/**
 * Obras OPR — custos (20261105100000_obras_custos.sql): orçamento por categoria nascido com a obra (dados do negócio e
 * parâmetros da calculadora), ajuste por admin ou gestor, custo real lançado por quem atua no Operacional (sem apagar,
 * com estorno único), deduções do lucro por empresa e quem vê. Nenhum valor em dinheiro no histórico da obra.
 * Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Custos A/B" + sufixo, usuários "cu-*" + sufixo). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let operacional: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

async function criarObra(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: neg!.id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 12, ordem: 0 }), "kit");
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const orcamento = async (quem: Usuario, obra: string) => {
  const { data } = await quem.cliente.from("obra_orcamento").select("categoria, planejado").eq("obra_id", obra);
  return Object.fromEntries((data ?? []).map((l) => [l.categoria, Number(l.planejado)]));
};
const custos = async (quem: Usuario, obra: string) => (await quem.cliente.from("obra_custos").select("id, categoria, valor, estorna_id").eq("obra_id", obra)).data ?? [];
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

describe("Obras OPR: custos (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;
  let lancamento: string;

  beforeAll(async () => {
    [admin, gestor, vendedor, operacional, adminB] = await Promise.all(["cu-admin", "cu-gestor", "cu-vendedor", "cu-operacional", "cu-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Custos A ${sufixo}` }, { nome: `Custos B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [operacional, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    // Gestor da equipe do vendedor: vê as obras dele.
    const { data: equipe } = ok(await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe custos" }).select("id").single(), "equipe");
    ok(
      await servico.from("equipe_membros").insert([
        { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
        { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
      ]),
      "equipe membros",
    );
    ok(
      await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[operacional.id], p_setores: [{ setor: "operacional", capacidade: "coordenar" }] as never }),
      "setor",
    );
    ok(
      await admin.cliente
        .from("parametros_calculadora")
        .update({ custo_material_ca_por_kwp: 100, custo_instalacao_por_modulo: 200, custo_engenharia: 1500, custo_frete: 300 })
        .eq("empresa_id", empresa),
      "parâmetros",
    );
    obra = await criarObra("Custos");
  });

  it("frete começa zerado na calculadora de uma empresa nova", async () => {
    const { data } = await servico.from("parametros_calculadora").select("custo_frete").eq("empresa_id", empresaB).single();
    expect(Number(data!.custo_frete)).toBe(0);
  });

  it("a obra nasce com o orçamento do negócio e dos parâmetros daquele momento", async () => {
    const { data: o } = await servico.from("obras").select("potencia_kwp").eq("id", obra).single();
    expect(await orcamento(admin, obra)).toEqual({
      equipamentos: 0, // sem cálculo solar salvo, não há preço do kit
      estrutura_materiais: Math.round(100 * Number(o!.potencia_kwp ?? 0) * 100) / 100,
      mao_de_obra: 200 * 12,
      homologacao: 1500,
      frete: 300,
    });
    // Mudar a calculadora depois não mexe no planejado.
    ok(await admin.cliente.from("parametros_calculadora").update({ custo_engenharia: 9999 }).eq("empresa_id", empresa), "parâmetros");
    expect((await orcamento(admin, obra)).homologacao).toBe(1500);
  });

  it("veem os custos: admin, gestor e o Operacional da obra; vendedor e outra empresa não", async () => {
    for (const quem of [gestor, operacional]) expect(Object.keys(await orcamento(quem, obra))).toHaveLength(5);
    expect(await orcamento(vendedor, obra)).toEqual({});
    expect(await orcamento(adminB, obra)).toEqual({});
  });

  it("orçamento: admin ou gestor ajusta; o histórico diz a categoria e nunca o valor", async () => {
    const ajustar = (quem: Usuario, valor: number) => quem.cliente.rpc("ajustar_orcamento_obra", { p_obra_id: obra, p_categoria: "frete", p_planejado: valor });
    expect((await ajustar(vendedor, 800)).error?.code).toBe("42501");
    expect((await ajustar(operacional, 800)).error?.code).toBe("42501");
    expect((await ajustar(gestor, -1)).error?.message).toContain("zero ou mais");
    expect((await gestor.cliente.rpc("ajustar_orcamento_obra", { p_obra_id: obra, p_categoria: "outra", p_planejado: 1 })).error?.message).toContain("Categoria");
    ok(await ajustar(gestor, 800), "ajuste");
    expect((await orcamento(admin, obra)).frete).toBe(800);
    const { data: h } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", "orcamento_ajustado");
    expect(h).toEqual([{ dados: { categoria: "frete" } }]);
    expect((await admin.cliente.from("obra_orcamento").update({ planejado: 1 }).eq("obra_id", obra)).error?.code).toBe("42501");
  });

  it("custo real: só o admin ou o Operacional da obra lança, com dados válidos", async () => {
    const lancar = (quem: Usuario, extra: Record<string, unknown> = {}) =>
      quem.cliente.rpc("lancar_custo_obra", { p_obra_id: obra, p_categoria: "mao_de_obra", p_valor: 1250.5, p_data: hoje(), p_descricao: "Diária da equipe", ...extra } as never);
    // O gestor coordena o Operacional (20261122100000): passa da autorização e esbarra na validação.
    expect((await lancar(gestor, { p_valor: 0 })).error?.message).toContain("maior que zero");
    expect((await lancar(vendedor)).error?.code).toBe("42501");
    expect((await lancar(operacional, { p_valor: 0 })).error?.message).toContain("maior que zero");
    expect((await lancar(operacional, { p_data: "2999-01-01" })).error?.message).toContain("data");
    expect((await lancar(operacional, { p_descricao: " " })).error?.message).toContain("Descreva");
    const { data: id } = ok(await lancar(operacional), "lançamento");
    lancamento = id as string;
    ok(await lancar(admin, { p_categoria: "frete", p_valor: 300 }), "admin");
    expect((await custos(gestor, obra)).map((c) => [c.categoria, Number(c.valor)]).sort()).toEqual([["frete", 300], ["mao_de_obra", 1250.5]]);
    expect(await custos(vendedor, obra)).toEqual([]);

    const { data: h } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", "custo_lancado");
    for (const l of h!) expect(Object.keys(l.dados as object).sort()).toEqual(["autorizacao", "categoria"]);
  });

  it("ninguém altera nem apaga um lançamento; o erro se corrige com um estorno único", async () => {
    for (const cliente of [admin.cliente, servico]) {
      expect((await cliente.from("obra_custos").update({ valor: 1 }).eq("id", lancamento)).error?.code).toBe("42501");
      expect((await cliente.from("obra_custos").delete().eq("id", lancamento)).error?.code).toBe("42501");
    }
    // O gestor passa da autorização (coordena o Operacional) e esbarra no motivo; o estorno de fato fica com o Operacional.
    expect((await gestor.cliente.rpc("estornar_custo_obra", { p_custo_id: lancamento, p_motivo: "" })).error?.message).toContain("motivo");
    expect((await vendedor.cliente.rpc("estornar_custo_obra", { p_custo_id: lancamento, p_motivo: "Lançado em dobro" })).error?.code).toBe("42501");
    expect((await operacional.cliente.rpc("estornar_custo_obra", { p_custo_id: lancamento, p_motivo: "" })).error?.message).toContain("motivo");
    ok(await operacional.cliente.rpc("estornar_custo_obra", { p_custo_id: lancamento, p_motivo: "Lançado em dobro" }), "estorno");
    expect((await operacional.cliente.rpc("estornar_custo_obra", { p_custo_id: lancamento, p_motivo: "De novo" })).error?.message).toContain("já foi estornado");

    const lista = await custos(admin, obra);
    const estorno = lista.find((c) => c.estorna_id === lancamento)!;
    expect(Number(estorno.valor)).toBe(-1250.5);
    expect((await operacional.cliente.rpc("estornar_custo_obra", { p_custo_id: estorno.id, p_motivo: "Desfazer" })).error?.message).toContain("não pode ser estornado");
    const maoDeObra = lista.filter((c) => c.categoria === "mao_de_obra").reduce((t, c) => t + Number(c.valor), 0);
    expect(maoDeObra).toBe(0);
  });

  it("deduções: nascem zeradas; admin e gestor mudam; vendedor não; o total não passa de 100%", async () => {
    const { data } = await gestor.cliente.from("obra_deducoes").select("impostos_percentual, comissoes_percentual").eq("empresa_id", empresa).single();
    expect([Number(data!.impostos_percentual), Number(data!.comissoes_percentual)]).toEqual([0, 0]);
    await vendedor.cliente.from("obra_deducoes").update({ impostos_percentual: 9 }).eq("empresa_id", empresa);
    await adminB.cliente.from("obra_deducoes").update({ impostos_percentual: 9 }).eq("empresa_id", empresa);
    const { data: igual } = await servico.from("obra_deducoes").select("impostos_percentual").eq("empresa_id", empresa).single();
    expect(Number(igual!.impostos_percentual)).toBe(0);
    expect((await gestor.cliente.from("obra_deducoes").update({ impostos_percentual: 60, comissoes_percentual: 50 }).eq("empresa_id", empresa)).error?.code).toBe("23514");
    ok(await gestor.cliente.from("obra_deducoes").update({ impostos_percentual: 8, comissoes_percentual: 3 }).eq("empresa_id", empresa), "gestor");
    ok(await admin.cliente.from("obra_deducoes").update({ impostos_percentual: 7.5 }).eq("empresa_id", empresa), "admin");
    expect((await admin.cliente.from("obra_deducoes").insert({ empresa_id: empresa })).error?.code).toBe("42501");
  });
});
