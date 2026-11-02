/**
 * Obras OPR — cronograma (20261104100000_obras_cronograma.sql): prazos das etapas por empresa (admin e gestor só mudam
 * os dias), entrega contratada gravada na chegada da obra e ajustada com motivo, "material entregue" como fim de
 * Compras, previsão do material por quem escreve em Compras e o cronograma calculado (previsto, real, previsão em
 * cascata, atraso próprio e herdado), sem acesso de outra empresa. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Cronograma A/B" + sufixo, usuários "cr-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { urlBancoLocal } from "./banco-local";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
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
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function cronograma(quem: Usuario, obra: string) {
  const { data, error } = await quem.cliente.rpc("cronograma_obra", { p_obra_id: obra });
  if (error) throw error;
  return data ?? [];
}

async function somar(inicio: string, dias: number): Promise<string> {
  const [l] = await noBanco("select public.somar_dias_uteis($1, $2::date, $3)::text as d", [empresa, inicio, dias]);
  return l.d;
}

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const PADRAO = { projeto: 7, homologacao: 15, compra: 5, entrega_material: 7, instalacao: 5, vistoria: 7, conexao: 5 };

describe("Obras OPR: cronograma (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;

  beforeAll(async () => {
    [admin, gestor, vendedor, adminB] = await Promise.all(["cr-admin", "cr-gestor", "cr-vendedor", "cr-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Cronograma A ${sufixo}` }, { nome: `Cronograma B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
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
    obra = await criarObra("Cronograma");
  });

  it("prazos padrão nascem com a empresa; admin e gestor só mudam os dias", async () => {
    const { data } = await gestor.cliente.from("obra_prazos_etapas").select("chave, dias_uteis").eq("empresa_id", empresa);
    expect(Object.fromEntries(data!.map((p) => [p.chave, p.dias_uteis]))).toEqual({ ...PADRAO, entrega_contratada: 51 });

    expect((await gestor.cliente.from("obra_prazos_etapas").insert({ empresa_id: empresa, chave: "projeto", dias_uteis: 3 })).error?.code).toBe("42501");
    expect((await admin.cliente.from("obra_prazos_etapas").delete().eq("empresa_id", empresa)).error?.code).toBe("42501");
    expect((await gestor.cliente.from("obra_prazos_etapas").update({ dias_uteis: 0 }).eq("empresa_id", empresa).eq("chave", "compra")).error?.code).toBe("23514");

    // Vendedor e outra empresa: a atualização não acha linha.
    await vendedor.cliente.from("obra_prazos_etapas").update({ dias_uteis: 9 }).eq("empresa_id", empresa).eq("chave", "compra");
    await adminB.cliente.from("obra_prazos_etapas").update({ dias_uteis: 9 }).eq("empresa_id", empresa).eq("chave", "compra");
    const { data: igual } = await servico.from("obra_prazos_etapas").select("dias_uteis").eq("empresa_id", empresa).eq("chave", "compra").single();
    expect(igual!.dias_uteis).toBe(5);

    ok(await gestor.cliente.from("obra_prazos_etapas").update({ dias_uteis: 6 }).eq("empresa_id", empresa).eq("chave", "compra"), "gestor");
    ok(await admin.cliente.from("obra_prazos_etapas").update({ dias_uteis: 5 }).eq("empresa_id", empresa).eq("chave", "compra"), "admin");
  });

  it("obra nova: entrega contratada = chegada + 51 dias úteis e o previsto soma as etapas em sequência", async () => {
    const { data: o } = await servico.from("obras").select("entrega_contratada").eq("id", obra).single();
    expect(o!.entrega_contratada).toBe(await somar(hoje(), 51));

    const linhas = await cronograma(admin, obra);
    expect(linhas.map((l) => l.etapa)).toEqual(Object.keys(PADRAO));
    let inicio = hoje();
    for (const l of linhas) {
      const fim = await somar(inicio, PADRAO[l.etapa as keyof typeof PADRAO]);
      expect([l.previsto_inicio, l.previsto_fim, l.previsao_inicio, l.previsao_fim], l.etapa).toEqual([inicio, fim, inicio, fim]);
      expect([l.atraso_dias, l.atraso_proprio, l.causa_etapa], l.etapa).toEqual([0, 0, null]);
      inicio = fim;
    }
    expect(linhas.at(-1)!.previsto_fim).toBe(o!.entrega_contratada);
    expect(linhas.map((l) => l.situacao)).toEqual(["andamento", "a_iniciar", "a_iniciar", "a_iniciar", "a_iniciar", "a_iniciar", "a_iniciar"]);
    expect(linhas[0]).toMatchObject({ real_inicio: hoje(), real_fim: null, dias_na_etapa: 0 });
  });

  it("quem vê a obra recebe o cronograma; outra empresa não", async () => {
    expect(await cronograma(vendedor, obra)).toHaveLength(7);
    expect(await cronograma(adminB, obra)).toEqual([]);
  });

  it("projeto que passa do prazo atrasa a própria etapa e empurra as seguintes, com a causa", async () => {
    // A obra chegou há 20 dias úteis: o projeto (7) já devia ter acabado e segue em andamento até hoje.
    const [{ d: chegada }] = await noBanco(
      "select (select d::date::text from generate_series(current_date - 60, current_date, interval '1 day') d where public.somar_dias_uteis($1, d::date, 20) >= public.hoje_brasilia() order by d limit 1) as d",
      [empresa],
    );
    await noBanco("update public.obras set created_at = ($2::date + time '12:00') at time zone 'America/Sao_Paulo' where id = $1", [obra, chegada]);

    const linhas = await cronograma(admin, obra);
    const projeto = linhas[0];
    expect(projeto).toMatchObject({ situacao: "andamento", real_inicio: chegada, previsao_fim: hoje(), causa_etapa: null });
    expect(projeto.atraso_dias).toBeGreaterThan(0);
    expect(projeto.atraso_proprio).toBe(projeto.atraso_dias);
    for (const l of linhas.slice(1)) {
      expect(l.atraso_dias, l.etapa).toBe(projeto.atraso_dias);
      expect([l.atraso_proprio, l.causa_etapa], l.etapa).toEqual([0, "projeto"]);
    }
  });

  it("previsão do material: só quem escreve em Compras; vale no lugar do prazo padrão e vira a causa seguinte", async () => {
    const longe = await somar(hoje(), 80);
    expect((await vendedor.cliente.rpc("definir_entrega_material_prevista", { p_obra_id: obra, p_data: longe })).error?.code).toBe("42501");
    expect((await gestor.cliente.rpc("definir_entrega_material_prevista", { p_obra_id: obra, p_data: longe })).error?.code).toBe("42501");
    ok(await admin.cliente.rpc("definir_entrega_material_prevista", { p_obra_id: obra, p_data: longe }), "previsão");

    const linhas = await cronograma(admin, obra);
    const entrega = linhas.find((l) => l.etapa === "entrega_material")!;
    expect(entrega.previsao_fim).toBe(longe);
    expect(entrega.atraso_proprio).toBeGreaterThan(0);
    expect(linhas.find((l) => l.etapa === "instalacao")).toMatchObject({ causa_etapa: "entrega_material", atraso_proprio: 0 });

    const { data: h } = await servico.from("obra_historico").select("setor, dados").eq("obra_id", obra).eq("tipo", "entrega_material_prevista");
    expect(h).toEqual([{ setor: "compras", dados: expect.objectContaining({ de: null, para: longe, autorizacao: "admin" }) }]);
  });

  it("Compras termina em 'material entregue': faturado deixa de concluir e as etapas ganham o fim real", async () => {
    const status = (s: string) => admin.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "compras", p_status: s });
    ok(await status("cotando"), "cotando");
    ok(await status("faturado_fornecedor"), "faturado");
    let { data: f } = await servico.from("obra_fluxos").select("concluido_em").eq("obra_id", obra).eq("setor", "compras").single();
    expect(f!.concluido_em).toBeNull();
    ok(await status("material_entregue"), "entregue");
    ({ data: f } = await servico.from("obra_fluxos").select("concluido_em").eq("obra_id", obra).eq("setor", "compras").single());
    expect(f!.concluido_em).not.toBeNull();

    const linhas = await cronograma(admin, obra);
    expect(linhas.find((l) => l.etapa === "compra")).toMatchObject({ situacao: "concluida", real_inicio: hoje(), real_fim: hoje() });
    // A previsão digitada não vale mais: o material chegou.
    expect(linhas.find((l) => l.etapa === "entrega_material")).toMatchObject({ situacao: "concluida", real_fim: hoje(), previsao_fim: hoje() });
  });

  it("entrega contratada: só admin ou gestor ajusta, sempre com motivo, e fica no histórico", async () => {
    const { data: antes } = await servico.from("obras").select("entrega_contratada").eq("id", obra).single();
    const nova = await somar(antes!.entrega_contratada, 10);
    expect((await vendedor.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obra, p_data: nova, p_motivo: "Cliente pediu" })).error?.code).toBe("42501");
    expect((await adminB.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obra, p_data: nova, p_motivo: "Cliente pediu" })).error?.code).toBe("42501");
    expect((await gestor.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obra, p_data: nova, p_motivo: " " })).error?.message).toContain("motivo");
    ok(await gestor.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obra, p_data: nova, p_motivo: "Cliente pediu mais prazo" }), "ajuste");

    const { data: depois } = await servico.from("obras").select("entrega_contratada").eq("id", obra).single();
    expect(depois!.entrega_contratada).toBe(nova);
    const { data: h } = await servico.from("obra_historico").select("dados, autor_membro_id").eq("obra_id", obra).eq("tipo", "entrega_contratada_ajustada");
    expect(h).toEqual([{ dados: { de: antes!.entrega_contratada, para: nova, motivo: "Cliente pediu mais prazo" }, autor_membro_id: membro[gestor.id] }]);
  });

  it("ninguém escreve direto nas colunas novas da obra", async () => {
    expect((await admin.cliente.from("obras").update({ entrega_contratada: hoje() }).eq("id", obra)).error?.code).toBe("42501");
    expect((await admin.cliente.from("obras").update({ entrega_material_prevista: hoje() }).eq("id", obra)).error?.code).toBe("42501");
  });
});
