/** Regras de banco da calculadora: parâmetros padrão, kits (só admin) e cálculo preso ao negócio. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor1: Usuario;
let adminOutra: Usuario;
let empresa: string;
let outra: string;
let negocio: string;
let kit: string;

beforeAll(async () => {
  [admin, vendedor1, adminOutra] = await Promise.all(["calc-admin", "calc-v1", "calc-outra"].map(criarUsuario));
  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Calculadora ${sufixo}` }, { nome: `Calculadora outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" },
    { empresa_id: outra, user_id: adminOutra.id, papel: "admin" },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Calculadora", telefone: "44 90000-0001" })
    .select("id")
    .single();
  const { data: n } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina 6 kWp", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id })
    .select("id")
    .single();
  negocio = n!.id;

  const { data: k, error } = await admin.cliente
    .from("kits_solares")
    .insert({ empresa_id: empresa, nome: "Kit 6 kWp", potencia_kwp: 6, preco: 24000 })
    .select("id")
    .single();
  if (error) throw error;
  kit = k!.id;
});

describe("parâmetros da calculadora", () => {
  it("toda empresa nasce com uma linha de parâmetros padrão", async () => {
    const { data } = await vendedor1.cliente.from("parametros_calculadora").select("*").eq("empresa_id", empresa).single();
    expect(data!.produtividade_kwh_kwp_mes).toBeGreaterThan(0);
    expect(data!.disponibilidade_tri_kwh).toBe(100);
  });

  it("vendedor não altera os parâmetros; admin altera", async () => {
    const { error: negado } = await vendedor1.cliente
      .from("parametros_calculadora")
      .update({ produtividade_kwh_kwp_mes: 999 })
      .eq("empresa_id", empresa);
    // RLS silencia o update (nenhuma linha afetada) em vez de dar erro.
    const { data: inalterado } = await servico
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes")
      .eq("empresa_id", empresa)
      .single();
    expect(negado).toBeNull();
    expect(inalterado!.produtividade_kwh_kwp_mes).not.toBe(999);

    const { error } = await admin.cliente
      .from("parametros_calculadora")
      .update({ produtividade_kwh_kwp_mes: 130 })
      .eq("empresa_id", empresa);
    expect(error).toBeNull();
    const { data: alterado } = await servico
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes")
      .eq("empresa_id", empresa)
      .single();
    expect(alterado!.produtividade_kwh_kwp_mes).toBe(130);
  });
});

describe("kits", () => {
  it("todo mundo da empresa vê os kits, mas só admin cria", async () => {
    const { data } = await vendedor1.cliente.from("kits_solares").select("id").eq("empresa_id", empresa);
    expect(data!.map((k) => k.id)).toContain(kit);

    const { error } = await vendedor1.cliente.from("kits_solares").insert({ empresa_id: empresa, nome: "Pirata", potencia_kwp: 1, preco: 1 });
    expect(error).not.toBeNull();
  });

  it("kit de uma empresa não aparece para a outra", async () => {
    const { data } = await adminOutra.cliente.from("kits_solares").select("id").eq("id", kit);
    expect(data).toEqual([]);
  });
});

describe("cálculo do negócio", () => {
  it("vendedor calcula e o resultado fica preso ao negócio (upsert por negócio)", async () => {
    const { error } = await vendedor1.cliente.from("calculos_solares").insert({
      empresa_id: empresa,
      negocio_id: negocio,
      kit_id: kit,
      kit_nome: "Kit 6 kWp",
      kit_potencia_kwp: 6,
      kit_preco: 24000,
      tipo_ligacao: "trifasico",
      consumo_medio_kwh: 500,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 130,
      percentual_fio_b: 0.6,
      disponibilidade_kwh: 100,
      geracao_estimada_kwh_mes: 780,
      kwh_faturado: 100,
      kwh_compensado: 400,
      custo_fio_b: 216,
      conta_sem_solar: 450,
      conta_com_solar: 306,
      economia_mensal: 144,
      payback_meses: 166.7,
    });
    expect(error).toBeNull();

    // Recalcular substitui o cálculo existente em vez de duplicar (unique em negocio_id).
    const { error: erroDuplicado } = await vendedor1.cliente.from("calculos_solares").insert({
      empresa_id: empresa,
      negocio_id: negocio,
      kit_id: kit,
      kit_nome: "Kit 6 kWp",
      kit_potencia_kwp: 6,
      kit_preco: 24000,
      tipo_ligacao: "trifasico",
      consumo_medio_kwh: 500,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 130,
      percentual_fio_b: 0.6,
      disponibilidade_kwh: 100,
      geracao_estimada_kwh_mes: 780,
      kwh_faturado: 100,
      kwh_compensado: 400,
      custo_fio_b: 216,
      conta_sem_solar: 450,
      conta_com_solar: 306,
      economia_mensal: 144,
      payback_meses: 166.7,
    });
    expect(erroDuplicado?.code).toBe("23505");
  });

  it("empresa de fora não vê o cálculo do negócio alheio", async () => {
    const { data } = await adminOutra.cliente.from("calculos_solares").select("id").eq("negocio_id", negocio);
    expect(data).toEqual([]);
  });
});
