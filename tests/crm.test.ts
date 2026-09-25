/** Regras do CRM base: visibilidade por hierarquia, numeração, histórico e duplicados. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let dono: Usuario;
let admin: Usuario;
let gestor: Usuario;
let vendedor1: Usuario; // na equipe do gestor
let vendedor2: Usuario; // fora da equipe
let adminOutra: Usuario;
let empresa: string;
let outra: string;
const membro: Record<string, string> = {};
let funil: string;
let etapas: { id: string; nome: string }[];
let negocio: string;

beforeAll(async () => {
  [dono, admin, gestor, vendedor1, vendedor2, adminOutra] = await Promise.all(
    ["dono2", "admin", "gestor", "vend1", "vend2", "admin-outra"].map(criarUsuario),
  );
  await servico.from("plataforma_admins").insert({ user_id: dono.id });
  const { data: e } = await dono.cliente.from("empresas").insert({ nome: `CRM ${sufixo}` }).select("id").single();
  const { data: o } = await dono.cliente.from("empresas").insert({ nome: `Outra ${sufixo}` }).select("id").single();
  empresa = e!.id;
  outra = o!.id;

  const { data: vinculos, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: vendedor2.id, papel: "vendedor", tipo_vendedor: "representante" },
      { empresa_id: outra, user_id: adminOutra.id, papel: "admin" },
    ])
    .select("id, user_id");
  expect(error).toBeNull();
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: equipe, error: erroEquipe } = await servico
    .from("equipes")
    .insert({ empresa_id: empresa, nome: "Norte" })
    .select("id")
    .single();
  if (erroEquipe) throw new Error(JSON.stringify(erroEquipe));
  const { error: erroMembros } = await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor1.id], e_gestor: false },
  ]);
  expect(erroMembros).toBeNull();

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id, nome").eq("funil_id", funil).order("ordem");
  etapas = et!;
});

describe("padrões da empresa", () => {
  it("empresa nova nasce com o funil e as origens padrão", async () => {
    expect(etapas.map((e) => e.nome)).toEqual(["Novo lead", "Contato feito", "Visita agendada", "Proposta enviada"]);
    const { data: origens } = await vendedor1.cliente.from("origens").select("nome").eq("empresa_id", empresa);
    expect(origens!.map((o) => o.nome)).toContain("Indicação");
  });

  it("vendedor não altera o funil", async () => {
    await vendedor1.cliente.from("etapas").update({ nome: "Hackeado" }).eq("id", etapas[0].id);
    const { data } = await servico.from("etapas").select("nome").eq("id", etapas[0].id).single();
    expect(data!.nome).toBe("Novo lead");
  });
});

describe("negócios", () => {
  it("quem cria vira responsável, na etapa inicial, com número sequencial", async () => {
    const { data: contato, error: ec } = await vendedor1.cliente
      .from("contatos")
      .insert({ empresa_id: empresa, nome: "João Cliente", telefone: "(44) 99999-1234" })
      .select("id")
      .single();
    expect(ec).toBeNull();

    const { data, error } = await vendedor1.cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: "Sistema 5 kWp", contato_id: contato!.id, funil_id: funil, etapa_id: etapas[0].id, valor: 18500 })
      .select("id, numero, responsavel_id, etapa_id")
      .single();
    expect(error).toBeNull();
    negocio = data!.id;
    expect(data!.numero).toBe(1);
    expect(data!.responsavel_id).toBe(membro[vendedor1.id]);
    expect(data!.etapa_id).toBe(etapas[0].id);

    const { data: timeline } = await vendedor1.cliente.from("atividades").select("tipo").eq("negocio_id", negocio);
    expect(timeline!.map((a) => a.tipo)).toEqual(["negocio_criado"]);
    const { data: eventos } = await servico.from("eventos").select("tipo").eq("entidade_id", negocio);
    expect(eventos!.map((ev) => ev.tipo)).toEqual(["deal.created"]);
  });

  it("gestor da equipe e admin veem; outro vendedor e outra empresa não", async () => {
    const ver = async (u: Usuario) => (await u.cliente.from("negocios").select("id").eq("id", negocio)).data!.length;
    expect(await ver(vendedor1)).toBe(1);
    expect(await ver(gestor)).toBe(1);
    expect(await ver(admin)).toBe(1);
    expect(await ver(vendedor2)).toBe(0);
    expect(await ver(adminOutra)).toBe(0);
    expect(await ver(dono)).toBe(0); // super-admin não vê dados comerciais
  });

  it("contato segue a mesma regra do negócio", async () => {
    const { data } = await vendedor2.cliente.from("contatos").select("id").eq("empresa_id", empresa);
    expect(data).toHaveLength(0);
    const { data: doGestor } = await gestor.cliente.from("contatos").select("id").eq("empresa_id", empresa);
    expect(doGestor).toHaveLength(1);
  });

  it("mover de etapa registra histórico, linha do tempo e evento", async () => {
    const { error } = await vendedor1.cliente.from("negocios").update({ etapa_id: etapas[1].id }).eq("id", negocio);
    expect(error).toBeNull();

    const { data: hist } = await vendedor1.cliente
      .from("historico_etapas")
      .select("etapa_id, saiu_em")
      .eq("negocio_id", negocio)
      .order("entrou_em");
    expect(hist!.map((h) => h.etapa_id)).toEqual([etapas[0].id, etapas[1].id]);
    expect(hist![0].saiu_em).not.toBeNull();
    expect(hist![1].saiu_em).toBeNull();

    const { data: eventos } = await servico.from("eventos").select("tipo").eq("entidade_id", negocio);
    expect(eventos!.map((e) => e.tipo)).toContain("deal.stage_changed");
  });

  it("vendedor não passa o negócio para outro vendedor, mas o gestor passa dentro da equipe", async () => {
    const { error } = await vendedor1.cliente
      .from("negocios")
      .update({ responsavel_id: membro[vendedor2.id] })
      .eq("id", negocio);
    expect(error).not.toBeNull();

    const { error: doGestor } = await gestor.cliente
      .from("negocios")
      .update({ responsavel_id: membro[gestor.id] })
      .eq("id", negocio);
    expect(doGestor).toBeNull();
    await gestor.cliente.from("negocios").update({ responsavel_id: membro[vendedor1.id] }).eq("id", negocio);
  });

  it("vendedor não cria negócio em nome de outro", async () => {
    const { data: c } = await servico.from("contatos").select("id").eq("empresa_id", empresa).limit(1).single();
    const { error } = await vendedor1.cliente.from("negocios").insert({
      empresa_id: empresa,
      titulo: "Fantasma",
      contato_id: c!.id,
      funil_id: funil,
      etapa_id: etapas[0].id,
      responsavel_id: membro[vendedor2.id],
    });
    expect(error).not.toBeNull();
  });

  it("não aceita etapa, contato ou funil de outra empresa", async () => {
    const { data: etapaOutra } = await servico.from("etapas").select("id").eq("empresa_id", outra).limit(1).single();
    const { error } = await vendedor1.cliente.from("negocios").update({ etapa_id: etapaOutra!.id }).eq("id", negocio);
    expect(error).not.toBeNull();
  });
});

describe("duplicados", () => {
  it("avisa que o telefone já é de um cliente de outro vendedor, sem mostrar os dados", async () => {
    const { data } = await vendedor2.cliente.rpc("buscar_contato_duplicado", {
      p_empresa_id: empresa,
      p_telefone: "44999991234",
      p_email: "",
    });
    expect(data).toHaveLength(1);
    expect(data![0].visivel).toBe(false);
    expect(data![0].responsavel_nome).toBe("vend1");
  });

  it("outra empresa não descobre nada", async () => {
    const { data } = await adminOutra.cliente.rpc("buscar_contato_duplicado", {
      p_empresa_id: empresa,
      p_telefone: "44999991234",
      p_email: "",
    });
    expect(data).toHaveLength(0);
  });
});
