/**
 * Conquistas por marco de evento (Evandro, 2026-10-02) — segunda métrica de critério
 * (`marco_contagem`), independente de XP/moedas: lê só `eventos` + o estado ao vivo da
 * tabela dona de cada marco (`negocios`, `contratos`, `confirmacoes_pagamento`), nunca
 * `gamification_rules`/`point_ledger` (`20261002140000_gamificacao_conquistas_marco_contagem.sql`).
 * Cobre a checklist pedida: atribuição (fonte causal/congelada, nunca o responsável atual),
 * deduplicação, reocorrência (estado reversível conta ao vivo, não a linha bruta em
 * `eventos`), perfil aplicável, corte temporal (`ativa_desde`), desativação/reativação, e
 * ausência de dependência de `gamification_rules`/`point_ledger`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let sdr1: Usuario;
let closer: Usuario;
let closer2: Usuario;
let gestor: Usuario;
let admin: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let etapaNegociacao: string;
let contato: string;

beforeAll(async () => {
  [sdr1, closer, closer2, gestor, admin] = await Promise.all(
    ["cm-sdr1", "cm-closer", "cm-closer2", "cm-gestor", "cm-admin"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Conquistas marco ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: sdr1.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: closer2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  etapaNegociacao = etapas![1].id;
  await servico.from("etapas").update({ marca_negociacao: true }).eq("id", etapaNegociacao);

  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe conquistas marco" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer2.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[sdr1.id], e_gestor: false },
  ]);

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente conquistas marco", telefone: "45999990000" }).select("id").single();
  contato = c!.id;
});

async function criarNegocio(titulo: string, responsavelId: string, etapaId = etapaInicial) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaId, responsavel_id: responsavelId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function marcarStatus(negocioId: string, status: "ganho" | "perdido" | "aberto", cliente: Usuario["cliente"]) {
  const { error } = await cliente.from("negocios").update({ status, valor: 10000 }).eq("id", negocioId);
  if (error) throw error;
}

async function criarEAssinarContrato(negocioId: string, cliente: Usuario["cliente"]) {
  const { data: contrato, error } = await cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAssinar } = await cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (erroAssinar) throw erroAssinar;
  return contrato!.id;
}

async function enviarEAceitar(negocioId: string, deUsuario: Usuario, paraUsuario: Usuario) {
  const { data: handoff, error } = await deUsuario.cliente
    .from("handoffs")
    .insert({
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contato,
      de_membro_id: membro[deUsuario.id],
      para_membro_id: membro[paraUsuario.id],
      status_qualificacao: "qualificado",
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAceite } = await paraUsuario.cliente.rpc("aceitar_handoff", { p_handoff_id: handoff!.id });
  if (erroAceite) throw erroAceite;
}

async function criarConquistaMarco(opts: {
  nome: string;
  marco: string;
  valor: number;
  xpBonus?: number;
  perfilAplicavel?: "sdr" | "closer" | "cs_farmer" | null;
  ativaDesde?: string;
}) {
  const { data, error } = await admin.cliente
    .from("conquistas")
    .insert({
      empresa_id: empresa,
      nome: opts.nome,
      criterio: { metrica: "marco_contagem", marco: opts.marco, valor: opts.valor },
      xp_bonus: opts.xpBonus ?? 0,
      perfil_aplicavel: opts.perfilAplicavel ?? null,
      ...(opts.ativaDesde ? { ativa_desde: opts.ativaDesde } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function desbloqueada(conquistaId: string, membroId: string) {
  const { data } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquistaId).eq("membro_id", membroId).maybeSingle();
  return data !== null;
}

describe("marco_contagem: atribuição causal, nunca o responsável atual", () => {
  it("deal.won credita quem era responsável na virada, não um responsável posterior", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "1a venda (closer)", marco: "deal.won", valor: 1 });
    const negocioId = await criarNegocio("Venda causal", membro[closer.id]);

    await marcarStatus(negocioId, "ganho", closer.cliente);
    // Reatribui o negócio DEPOIS do ganho — closer2 nunca pode herdar esse crédito.
    await servico.from("negocios").update({ responsavel_id: membro[closer2.id] }).eq("id", negocioId);

    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(false);
  });

  it("pagamento.confirmado credita o responsável congelado na assinatura, não o atual", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "1º pagamento", marco: "pagamento.confirmado", valor: 1 });
    const negocioId = await criarNegocio("Pagamento causal", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    // Redistribuição depois da assinatura: responsavel_assinatura_id do contrato fica congelado.
    await servico.from("negocios").update({ responsavel_id: membro[closer2.id] }).eq("id", negocioId);

    const { error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();

    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(false);
  });

  it("handoff.won credita o SDR de origem, não quem fechou a venda", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "1ª oportunidade convertida", marco: "handoff.won", valor: 1, perfilAplicavel: "sdr" });
    const negocioId = await criarNegocio("Handoff causal", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);

    await marcarStatus(negocioId, "ganho", closer.cliente);

    expect(await desbloqueada(conquistaId, membro[sdr1.id])).toBe(true);
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(false);
  });
});

describe("marco_contagem: estado ao vivo, não contagem bruta de eventos (reocorrência)", () => {
  it("negócio reaberto sem reganhar não conta, e um 2º negócio ganho completa o threshold", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "2 vendas", marco: "deal.won", valor: 2 });
    const negocioA = await criarNegocio("Venda A", membro[closer.id]);
    const negocioB = await criarNegocio("Venda B", membro[closer.id]);

    await marcarStatus(negocioA, "ganho", closer.cliente);
    await marcarStatus(negocioA, "aberto", closer.cliente); // reabre: não é mais 'ganho' ao vivo
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(false);

    await marcarStatus(negocioB, "ganho", closer.cliente);
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(false); // só 1 ganho ao vivo (B)

    await marcarStatus(negocioA, "ganho", closer.cliente); // reganha A
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true); // agora 2 ao vivo
  });

  it("contrato cancelado não conta pro threshold; só contratos assinados ao vivo contam", async () => {
    // Threshold 1 desbloquearia já na primeira assinatura (conquista é permanente depois
    // de desbloqueada) — threshold 2 é necessário pra observar que um contrato cancelado
    // deixa de contar, sem reabrir uma conquista já concedida.
    const conquistaId = await criarConquistaMarco({ nome: "2 contratos assinados", marco: "contrato.assinado", valor: 2 });
    const negocioA = await criarNegocio("Contrato ciclo A", membro[closer2.id]);
    const contratoA = await criarEAssinarContrato(negocioA, closer2.cliente);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(false); // só 1 assinado

    await closer2.cliente.from("contratos").update({ status: "rascunho" }).eq("id", contratoA);

    const negocioB = await criarNegocio("Contrato ciclo B", membro[closer2.id]);
    await criarEAssinarContrato(negocioB, closer2.cliente);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(false); // só B ao vivo (A cancelado)

    await closer2.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoA); // reassina A
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(true); // agora 2 ao vivo
  });
});

describe("marco_contagem: perfil aplicável", () => {
  it("conquista restrita a 'sdr' não desbloqueia para um closer no mesmo marco", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "SDR converteu", marco: "deal.won", valor: 1, perfilAplicavel: "sdr" });
    const negocioId = await criarNegocio("Venda closer, conquista de sdr", membro[closer.id]);

    await marcarStatus(negocioId, "ganho", closer.cliente);

    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(false);
  });
});

describe("marco_contagem: corte temporal (ativa_desde)", () => {
  it("evento anterior à criação da conquista não conta; só os a partir de ativa_desde", async () => {
    const negocioAntes = await criarNegocio("Antes da conquista", membro[closer.id]);
    await marcarStatus(negocioAntes, "ganho", closer.cliente);

    // Conquista criada depois: ativa_desde = agora, o ganho acima não deve contar.
    const conquistaId = await criarConquistaMarco({ nome: "1 venda depois de criada", marco: "deal.won", valor: 1 });
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(false);

    // Um novo ganho, depois de ativa_desde, completa o marco.
    const negocioDepois = await criarNegocio("Depois da conquista", membro[closer.id]);
    await marcarStatus(negocioDepois, "ganho", closer.cliente);
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true);
  });
});

describe("marco_contagem: desativação não apaga histórico; reativação permite novo desbloqueio", () => {
  it("conquista desativada não desbloqueia para quem ainda não tinha; reativada, volta a valer", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "Contrato assinado (toggle)", marco: "contrato.assinado", valor: 1 });
    await admin.cliente.from("conquistas").update({ ativa: false }).eq("id", conquistaId);

    const negocioId = await criarNegocio("Durante desativação", membro[closer2.id]);
    await criarEAssinarContrato(negocioId, closer2.cliente);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(false);

    await admin.cliente.from("conquistas").update({ ativa: true }).eq("id", conquistaId);
    // V1: sem janela de ativação — reativar reavalia e o fato que já existia ao vivo conta.
    const negocioGatilho = await criarNegocio("Gatilho pós-reativação", membro[closer2.id]);
    await criarEAssinarContrato(negocioGatilho, closer2.cliente);
    expect(await desbloqueada(conquistaId, membro[closer2.id])).toBe(true);
  });
});

describe("marco_contagem: deduplicação e idempotência", () => {
  it("dois eventos emitidos em sequência não geram dois desbloqueios da mesma conquista", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "Única por marco", marco: "deal.won", valor: 1 });
    const negocioA = await criarNegocio("Dedup A", membro[closer.id]);
    const negocioB = await criarNegocio("Dedup B", membro[closer.id]);

    await marcarStatus(negocioA, "ganho", closer.cliente);
    await marcarStatus(negocioB, "ganho", closer.cliente);

    const { data } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquistaId).eq("membro_id", membro[closer.id]);
    expect(data).toHaveLength(1);
  });
});

describe("marco_contagem: sem dependência de gamification_rules/point_ledger", () => {
  it("desbloqueia mesmo sem nenhuma regra de pontuação ativa para o evento, e o bônus é o único lançamento", async () => {
    // Nenhuma gamification_rule criada pra 'contrato.assinado' nesta empresa — se o motor de
    // marco dependesse de regra/point_ledger pra contar, nunca desbloquearia.
    const conquistaId = await criarConquistaMarco({ nome: "10 contratos (sem regra)", marco: "contrato.assinado", valor: 1, xpBonus: 7 });
    const negocioId = await criarNegocio("Sem regra ativa", membro[closer.id]);
    await criarEAssinarContrato(negocioId, closer.cliente);

    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true);

    const { data: lancamentos } = await servico
      .from("point_ledger")
      .select("xp, referencia_tipo, referencia_id")
      .eq("membro_id", membro[closer.id])
      .eq("referencia_tipo", "conquista")
      .eq("referencia_id", conquistaId);
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos![0].xp).toBe(7);
  });
});
