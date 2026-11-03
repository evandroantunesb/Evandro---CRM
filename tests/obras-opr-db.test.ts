/**
 * Obras OPR — visão Completa (20261106100000_obras_opr_completa.sql): gestor vê todas as obras da empresa (com o valor
 * vendido), prazos para o semáforo e o progresso (`prazos_obras`), justificativa de atraso (pedir, cobrar, responder)
 * e escalonamentos (abrir, fechar). Nenhum valor em dinheiro no histórico da obra. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("OPR A/B" + sufixo, usuários "opr-*" + sufixo). Os testes seguem em ordem.
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
let vendedor2: Usuario;
let engenheiro: Usuario;
let operacional: Usuario;
let adminB: Usuario;
let empresa: string;
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

const historico = async (obra: string, tipos: string[]) =>
  (await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra).in("tipo", tipos).order("created_at")).data ?? [];

describe("Obras OPR: visão Completa (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;
  let justificativa: string;

  beforeAll(async () => {
    [admin, gestor, vendedor, vendedor2, engenheiro, operacional, adminB] = await Promise.all(
      ["opr-admin", "opr-gestor", "opr-vendedor", "opr-vendedor-2", "opr-engenheiro", "opr-operacional", "opr-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `OPR A ${sufixo}` }, { nome: `OPR B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    const empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [vendedor2, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engenheiro, empresa, { papel: "operacao" }],
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
    // O gestor NÃO é gestor da equipe do vendedor: antes desta migration, não veria a obra.
    for (const [quem, setor, capacidade] of [
      [engenheiro, "engenharia", "executar"],
      [operacional, "operacional", "coordenar"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never }), `setor ${setor}`);
    }
    obra = await criarObra("OPR");
  });

  it("gestor vê todas as obras da empresa, com o valor vendido; outro vendedor e outra empresa não", async () => {
    expect((await gestor.cliente.from("obras").select("id").eq("id", obra)).data).toHaveLength(1);
    expect((await gestor.cliente.from("obra_dados_comerciais").select("valor_vendido").eq("obra_id", obra)).data).toHaveLength(1);
    expect((await gestor.cliente.from("obra_orcamento").select("categoria").eq("obra_id", obra)).data).toHaveLength(5);
    for (const quem of [vendedor2, adminB]) {
      expect((await quem.cliente.from("obras").select("id").eq("id", obra)).data, quem.email).toEqual([]);
      expect((await quem.cliente.from("obra_dados_comerciais").select("valor_vendido").eq("obra_id", obra)).data, quem.email).toEqual([]);
    }
  });

  it("prazos para o semáforo: obra recém-chegada está no projeto, sem atraso; quem não vê a obra não recebe nada", async () => {
    const { data } = ok(await gestor.cliente.rpc("prazos_obras", { p_obra_ids: [obra] }), "prazos");
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ obra_id: obra, etapa_atual: "projeto", atraso_entrega: 0, maior_atraso: 0, maior_atraso_etapa: null, etapas_concluidas: [], concluida_em: null });
    expect(data![0].progresso).toBeGreaterThanOrEqual(0);
    expect(data![0].progresso).toBeLessThan(100);
    expect(data![0].vence_em).not.toBeNull();
    expect((await adminB.cliente.rpc("prazos_obras", { p_obra_ids: [obra] })).data).toEqual([]);
    expect((await vendedor2.cliente.rpc("prazos_obras", { p_obra_ids: [obra] })).data).toEqual([]);
  });

  it("justificativa: só para etapa com atraso próprio, e o setor precisa de responsável principal", async () => {
    const pedir = (quem: Usuario, etapa = "projeto") => quem.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: etapa });
    expect((await pedir(gestor)).error?.message).toContain("atraso próprio");

    // A obra chegou há 20 dias úteis: o projeto (7) já devia ter acabado.
    const [{ d: chegada }] = await noBanco(
      "select (select d::date::text from generate_series(current_date - 60, current_date, interval '1 day') d where public.somar_dias_uteis($1, d::date, 20) >= public.hoje_brasilia() order by d limit 1) as d",
      [empresa],
    );
    await noBanco("update public.obras set created_at = ($2::date + time '12:00') at time zone 'America/Sao_Paulo' where id = $1", [obra, chegada]);
    const { data: prazos } = await gestor.cliente.rpc("prazos_obras", { p_obra_ids: [obra] });
    expect(prazos![0].maior_atraso).toBeGreaterThan(0);
    expect(prazos![0].maior_atraso_etapa).toBe("projeto");
    expect(prazos![0].progresso).toBeGreaterThan(0);

    expect((await pedir(gestor)).error?.message).toContain("responsável principal");
    ok(
      await admin.cliente.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: membro[engenheiro.id],
        p_setor: "engenharia",
        p_funcao: "responsavel",
        p_principal: true,
      }),
      "responsável",
    );
    for (const quem of [vendedor, operacional, engenheiro, adminB]) expect((await pedir(quem)).error?.code, quem.email).toBe("42501");
    expect((await pedir(gestor, "outra")).error?.code).toBe("23514");
  });

  it("gestor pede; pedir de novo é cobrar (mesmo pedido, prazo renovado); o pedido vai ao responsável", async () => {
    const { data: id } = ok(await gestor.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "pedido");
    justificativa = id!;
    const { data: cobrado } = ok(await admin.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "cobrança");
    expect(cobrado).toBe(justificativa);
    const { data: linhas } = await engenheiro.cliente.from("obra_justificativas_atraso").select("pedido_a, cobrado_em, prazo, texto").eq("obra_id", obra);
    expect(linhas).toHaveLength(1);
    expect(linhas![0]).toMatchObject({ pedido_a: membro[engenheiro.id], texto: null });
    expect(linhas![0].cobrado_em).not.toBeNull();
    const [{ prazo }] = await noBanco("select public.somar_dias_uteis($1, public.hoje_brasilia(), 2)::text as prazo", [empresa]);
    expect(linhas![0].prazo).toBe(prazo);
  });

  it("responde quem recebeu o pedido (ou admin, ou quem coordena o setor); uma vez só", async () => {
    const responder = (quem: Usuario, texto = "Cliente enviou a documentação com atraso.") =>
      quem.cliente.rpc("responder_justificativa_atraso", { p_justificativa_id: justificativa, p_texto: texto });
    for (const quem of [operacional, gestor, vendedor, adminB]) expect((await responder(quem)).error?.code, quem.email).toBe("42501");
    expect((await responder(engenheiro, "ok")).error?.message).toContain("3 a 500");
    ok(await responder(engenheiro), "resposta");
    expect((await responder(engenheiro)).error?.message).toContain("já foi respondida");
    // Escrita direta é negada.
    expect((await admin.cliente.from("obra_justificativas_atraso").update({ texto: "outro" }).eq("id", justificativa)).error?.code).toBe("42501");

    const eventos = await historico(obra, ["justificativa_atraso_pedida", "justificativa_atraso_cobrada", "justificativa_atraso_respondida"]);
    expect(eventos.map((e) => e.tipo)).toEqual(["justificativa_atraso_pedida", "justificativa_atraso_cobrada", "justificativa_atraso_respondida"]);
    for (const e of eventos) expect(e.dados).toEqual({ etapa: "projeto" });
  });

  it("escalonamento: abrem e fecham gestor, admin e o Operacional da obra; o valor não vai para o histórico", async () => {
    const abrir = (quem: Usuario, titulo: string, valor?: number) => quem.cliente.rpc("abrir_escalonamento_obra", { p_obra_id: obra, p_titulo: titulo, p_valor: valor });
    for (const quem of [vendedor, engenheiro, adminB]) expect((await abrir(quem, "Aprovar custo extra")).error?.code, quem.email).toBe("42501");
    expect((await abrir(gestor, "Aprovar custo extra", 0)).error?.message).toContain("maior que zero");
    expect((await abrir(gestor, "ok")).error?.message).toContain("3 a 200");

    const { data: comValor } = ok(await abrir(operacional, "Aprovar custo extra do reforço de estrutura", 14600), "abrir com valor");
    const { data: semValor } = ok(await abrir(gestor, "Avisar o cliente sobre a nova data de entrega"), "abrir sem valor");
    const { data: vistos } = await gestor.cliente.from("obra_escalonamentos").select("id, valor, fechado_em").eq("obra_id", obra).order("aberto_em");
    expect(vistos!.map((e) => [e.id, e.valor == null ? null : Number(e.valor), e.fechado_em])).toEqual([
      [comValor, 14600, null],
      [semValor, null, null],
    ]);
    // Quem não vê os custos da obra não vê os escalonamentos.
    for (const quem of [vendedor, engenheiro, adminB]) expect((await quem.cliente.from("obra_escalonamentos").select("id").eq("obra_id", obra)).data, quem.email).toEqual([]);
    expect((await admin.cliente.from("obra_escalonamentos").insert({ empresa_id: empresa, obra_id: obra, titulo: "Direto" })).error?.code).toBe("42501");

    const fechar = (quem: Usuario, id: string, resolucao = "Custo aprovado pelo gestor.") =>
      quem.cliente.rpc("fechar_escalonamento_obra", { p_escalonamento_id: id, p_resolucao: resolucao });
    expect((await fechar(vendedor, comValor!)).error?.code).toBe("42501");
    expect((await fechar(gestor, comValor!, "ok")).error?.message).toContain("3 a 500");
    ok(await fechar(gestor, comValor!), "fechar");
    ok(await fechar(operacional, semValor!, "Cliente avisado por telefone."), "fechar operacional");
    expect((await fechar(gestor, comValor!)).error?.message).toContain("já foi fechado");

    const eventos = await historico(obra, ["escalonamento_aberto", "escalonamento_fechado"]);
    expect(eventos.map((e) => e.tipo)).toEqual(["escalonamento_aberto", "escalonamento_aberto", "escalonamento_fechado", "escalonamento_fechado"]);
    expect(JSON.stringify(eventos)).not.toContain("14600");
  });
});
