/** Regras de banco da proposta: quem vê o negócio vê/gera, e só o serviço grava aberturas. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor1: Usuario;
let adminOutra: Usuario;
let empresa: string;
let negocio: string;
let propostaId: string;

beforeAll(async () => {
  [admin, vendedor1, adminOutra] = await Promise.all(["prop-admin", "prop-v1", "prop-outra"].map(criarUsuario));
  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Proposta ${sufixo}` }, { nome: `Proposta outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  const outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" },
    { empresa_id: outra, user_id: adminOutra.id, papel: "admin" },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Proposta", telefone: "44 90000-0002", endereco: "Rua Teste, 1" })
    .select("id")
    .single();
  const { data: n } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina proposta", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id })
    .select("id")
    .single();
  negocio = n!.id;

  const { data: k } = await admin.cliente
    .from("kits_solares")
    .insert({ empresa_id: empresa, nome: "Kit proposta", potencia_kwp: 4, preco: 18000 })
    .select("id")
    .single();
  const { data: calc, error } = await vendedor1.cliente
    .from("calculos_solares")
    .insert({
      empresa_id: empresa,
      negocio_id: negocio,
      kit_id: k!.id,
      kit_nome: "Kit proposta",
      kit_potencia_kwp: 4,
      kit_preco: 18000,
      tipo_ligacao: "trifasico",
      consumo_medio_kwh: 400,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.6,
      disponibilidade_kwh: 100,
      geracao_estimada_kwh_mes: 480,
      kwh_faturado: 100,
      kwh_compensado: 300,
      custo_fio_b: 162,
      conta_sem_solar: 360,
      conta_com_solar: 252,
      economia_mensal: 108,
      payback_meses: 166.7,
    })
    .select("id")
    .single();
  if (error) throw error;
  void calc;
});

describe("proposta", () => {
  it("vendedor gera a proposta do próprio negócio e ela nasce com token único", async () => {
    const { data, error } = await vendedor1.cliente
      .from("propostas")
      .insert({ empresa_id: empresa, negocio_id: negocio })
      .select("id, token")
      .single();
    expect(error).toBeNull();
    expect(data!.token).toBeTruthy();
    propostaId = data!.id;
  });

  it("só existe uma proposta por negócio (unique em negocio_id)", async () => {
    const { error } = await vendedor1.cliente.from("propostas").insert({ empresa_id: empresa, negocio_id: negocio });
    expect(error?.code).toBe("23505");
  });

  it("empresa de fora não vê a proposta do negócio alheio", async () => {
    const { data } = await adminOutra.cliente.from("propostas").select("id").eq("negocio_id", negocio);
    expect(data).toEqual([]);
  });
});

describe("aberturas da proposta", () => {
  it("vendedor autenticado não consegue gravar abertura (só o serviço, na rota pública)", async () => {
    const { error } = await vendedor1.cliente.from("propostas_aberturas").insert({ proposta_id: propostaId });
    expect(error).not.toBeNull();
  });

  it("a rota pública (chave de serviço) grava a abertura, e quem vê o negócio vê o histórico", async () => {
    const { error } = await servico.from("propostas_aberturas").insert({ proposta_id: propostaId });
    expect(error).toBeNull();

    const { data } = await vendedor1.cliente.from("propostas_aberturas").select("id, aberta_em").eq("proposta_id", propostaId);
    expect(data!.length).toBe(1);
  });

  it("empresa de fora não vê as aberturas de uma proposta alheia", async () => {
    const { data } = await adminOutra.cliente.from("propostas_aberturas").select("id").eq("proposta_id", propostaId);
    expect(data).toEqual([]);
  });
});
