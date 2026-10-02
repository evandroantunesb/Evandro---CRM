/**
 * Corretiva pedida pelo Evandro em 2026-10-02, antes da separação XP x moedas — dois bugs
 * encontrados em revisão (Opus), ver `20261001260000_gamificacao_fix_reocorrencia.sql`:
 *
 * 1. `unica_por_negocio` parou de funcionar (derrubado silenciosamente em duas redefinições
 *    seguidas de `aplicar_regras_gamificacao()`). Restaurado aqui, testado diretamente no
 *    motor (sem depender de um fluxo de app específico) pra garantir que a proteção é
 *    genérica, não um tratamento especial de um evento só.
 * 2. `handoff.won` e `handoff.contrato_assinado` confundiam "o fato já ocorreu alguma vez"
 *    (guarda `not exists` em `eventos`, que nunca enxerga um estorno — `estornar_lancamentos_evento`
 *    só mexe em `point_ledger`) com "existe crédito ativo agora". Depois de um estorno
 *    formal (negócio reaberto, contrato sai de assinado), uma reocorrência legítima deve
 *    voltar a pontuar — testado com os dois eventos reais, de ponta a ponta.
 *
 * O ciclo "pagamento confirmado → estornado → reconfirmado" já tinha teste de ponta a ponta
 * em `gamificacao-pagamento-confirmado.test.ts` (evento sem guarda nenhuma desde a origem) —
 * aqui só se acrescenta a cobertura de que `unica_por_negocio` também funciona nesse evento.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let sdr1: Usuario;
let closer: Usuario;
let gestor: Usuario;
let admin: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let etapaNegociacao: string;
let contato: string;

beforeAll(async () => {
  [sdr1, closer, gestor, admin] = await Promise.all(["fr-sdr1", "fr-closer", "fr-gestor", "fr-admin"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Fix reocorrência ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: sdr1.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  // Nenhuma etapa do funil padrão nasce com marca_negociacao (default false) — marca a 2ª pra
  // poder testar o evento deal.negotiation_started.
  etapaNegociacao = etapas![1].id;
  await servico.from("etapas").update({ marca_negociacao: true }).eq("id", etapaNegociacao);

  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe fix reocorrência" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer.id], e_gestor: false },
  ]);

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente fix reocorrência" }).select("id").single();
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

async function marcarStatus(negocioId: string, status: "ganho" | "perdido" | "aberto", cliente: Usuario["cliente"]) {
  const { error } = await cliente.from("negocios").update({ status, valor: 15000 }).eq("id", negocioId);
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

async function criarRegra(evento_tipo: string, valor: number, nome = evento_tipo) {
  // `gamification_rules` só aceita insert de quem tem papel admin (RLS "admin cria regra de
  // gamificacao") — nem gestor, nem service_role. xp=moedas=valor preserva o comportamento
  // pré-split destes testes (interessados na mecânica de reocorrência/estorno, não na
  // separação XP x moedas em si, coberta em gamificacao-xp-moedas.test.ts).
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({ empresa_id: empresa, nome, evento_tipo, xp: valor, moedas: valor, unica_por_negocio: true })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

describe("motor: unica_por_negocio (teste direto, sem depender de um evento de negócio específico)", () => {
  it("primeira ocorrência pontua, repetição sem estorno não pontua, estorno libera nova ocorrência", async () => {
    const negocioId = await criarNegocio("Negócio sintético motor", membro[closer.id]);
    const regraId = await criarRegra("teste.reocorrencia.motor", 10);

    async function emitirEvento() {
      const { data, error } = await servico
        .from("eventos")
        .insert({ empresa_id: empresa, tipo: "teste.reocorrencia.motor", ator_id: closer.id, entidade: "negocio", entidade_id: negocioId })
        .select("id")
        .single();
      if (error) throw error;
      return data!.id;
    }

    // 1. primeira ocorrência pontua.
    await emitirEvento();
    let { data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at");
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(false);
    const primeiraLinhaId = ledger![0].id;

    // 2. repetição sem reversão não pontua (unica_por_negocio bloqueia o farm).
    await emitirEvento();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(1);

    // 3. ocorrência → estorno → nova ocorrência válida pontua novamente. Usa o mecanismo real
    // de estorno (point_ledger não aceita update direto, nem de service_role — só via RPC
    // security definer, mesma trava de handoffs/confirmacoes_pagamento).
    const { error: erroEstorno } = await servico.rpc("estornar_lancamentos_evento", {
      p_entidade_id: negocioId,
      p_eventos_tipo: ["teste.reocorrencia.motor"],
    });
    expect(erroEstorno).toBeNull();
    await emitirEvento();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(2);
    expect(ledger![0].id).toBe(primeiraLinhaId);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![1].estornado).toBe(false);
    const segundaLinhaId = ledger![1].id;

    // 4. repetição da segunda ocorrência (ainda ativa) de novo não pontua.
    await emitirEvento();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(2);

    // 5. múltiplos ciclos preservam histórico: um segundo estorno+reocorrência soma uma 3ª linha,
    //    sem apagar nem alterar as duas primeiras.
    await servico.rpc("estornar_lancamentos_evento", {
      p_entidade_id: negocioId,
      p_eventos_tipo: ["teste.reocorrencia.motor"],
    });
    await emitirEvento();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(3);
    expect(ledger!.map((l) => l.id)).toEqual([primeiraLinhaId, segundaLinhaId, ledger![2].id]);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![1].estornado).toBe(true);
    expect(ledger![2].estornado).toBe(false);
    expect(ledger!.every((l) => l.xp === 10)).toBe(true);
  });
});

describe("handoff.won: estorno automático (negócio reaberto) libera reocorrência legítima", () => {
  it("ganho → reaberto → ganho de novo: 2 eventos, 2 lançamentos (1 estornado), mesmo beneficiário (SDR)", async () => {
    const negocioId = await criarNegocio("Negócio handoff.won ciclo", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);
    const regraId = await criarRegra("handoff.won", 20);

    await marcarStatus(negocioId, "ganho", closer.cliente);
    const { data: eventosGanho1 } = await servico.from("eventos").select("id, beneficiario_id").eq("entidade_id", negocioId).eq("tipo", "handoff.won");
    expect(eventosGanho1).toHaveLength(1);
    expect(eventosGanho1![0].beneficiario_id).toBe(sdr1.id);

    let { data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at");
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(false);

    // Reabrir estorna o par deal.won/handoff.won (ver estornar_lancamentos_evento em registrar_negocio).
    await marcarStatus(negocioId, "aberto", closer.cliente);
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(true);

    // Ganhar de novo é reocorrência legítima: novo evento, nova pontuação.
    await marcarStatus(negocioId, "ganho", closer.cliente);
    const { data: eventosGanho2 } = await servico.from("eventos").select("id, beneficiario_id").eq("entidade_id", negocioId).eq("tipo", "handoff.won");
    expect(eventosGanho2).toHaveLength(2);
    expect(eventosGanho2!.every((e) => e.beneficiario_id === sdr1.id)).toBe(true);

    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(2);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![1].estornado).toBe(false);
  });
});

describe("handoff.contrato_assinado: estorno automático (contrato sai de assinado) libera reocorrência legítima", () => {
  it("assinado → rascunho → assinado de novo: 2 eventos, 2 lançamentos (1 estornado), mesmo beneficiário (SDR)", async () => {
    const negocioId = await criarNegocio("Negócio handoff.contrato_assinado ciclo", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);
    const regraId = await criarRegra("handoff.contrato_assinado", 15);

    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    const { data: eventos1 } = await servico
      .from("eventos")
      .select("id, beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");
    expect(eventos1).toHaveLength(1);
    expect(eventos1![0].beneficiario_id).toBe(sdr1.id);

    let { data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at");
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(false);
    const primeiraLinhaId = ledger![0].id;

    // Sai de 'assinado': estorna o par contrato.assinado/handoff.contrato_assinado.
    const { error: erroVoltar } = await closer.cliente.from("contratos").update({ status: "rascunho" }).eq("id", contratoId);
    expect(erroVoltar).toBeNull();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![0].id).toBe(primeiraLinhaId);

    // Reassina: reocorrência legítima, novo evento, nova pontuação, histórico antigo intocado.
    const { error: erroAssinarDeNovo } = await closer.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoId);
    expect(erroAssinarDeNovo).toBeNull();

    const { data: eventos2 } = await servico
      .from("eventos")
      .select("id, beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");
    expect(eventos2).toHaveLength(2);
    expect(eventos2!.every((e) => e.beneficiario_id === sdr1.id)).toBe(true);

    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(2);
    expect(ledger![0].id).toBe(primeiraLinhaId);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![0].xp).toBe(15);
    expect(ledger![1].estornado).toBe(false);
  });
});

describe("pagamento.confirmado com unica_por_negocio: ciclo confirmar → estornar → reconfirmar continua correto", () => {
  it("2 lançamentos (1 estornado), nenhuma duplicação enquanto o pagamento está ativo", async () => {
    const negocioId = await criarNegocio("Negócio pagamento unica_por_negocio", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    const regraId = await criarRegra("pagamento.confirmado", 25);

    const { data: conf1, error: erro1 } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(erro1).toBeNull();

    let { data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at");
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(false);

    const { error: erroEstorno } = await gestor.cliente.rpc("estornar_confirmacao_pagamento", {
      p_contrato_id: contratoId,
      p_motivo: "Reconciliação de teste",
    });
    expect(erroEstorno).toBeNull();
    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(1);
    expect(ledger![0].estornado).toBe(true);

    const { data: conf2, error: erro2 } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(erro2).toBeNull();
    expect(conf2!.beneficiario_user_id).toBe(closer.id);
    expect(conf1!.id).not.toBe(conf2!.id);

    ({ data: ledger } = await servico.from("point_ledger").select("id, estornado, xp").eq("regra_id", regraId).order("created_at"));
    expect(ledger).toHaveLength(2);
    expect(ledger![0].estornado).toBe(true);
    expect(ledger![1].estornado).toBe(false);
  });
});

describe("deal.negotiation_started: sair/voltar de etapa sem invalidação legítima não farma pontos", () => {
  it("entrar, sair e voltar pra etapa de negociação continua emitindo um único evento (guarda não tocada nesta corretiva)", async () => {
    // Este evento não tem par de estorno em lugar nenhum do projeto (confirmado por auditoria
    // antes de codar) — sua guarda `not exists` continua correta como está, intocada por esta
    // migration. Cobre explicitamente o cenário que Evandro pediu pra não regredir.
    const negocioId = await criarNegocio("Negócio sai e volta de etapa", membro[closer.id], etapaInicial);
    await criarRegra("deal.negotiation_started", 5);

    await servico.from("negocios").update({ etapa_id: etapaNegociacao }).eq("id", negocioId);
    await servico.from("negocios").update({ etapa_id: etapaInicial }).eq("id", negocioId);
    await servico.from("negocios").update({ etapa_id: etapaNegociacao }).eq("id", negocioId);

    const { data: eventos } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.negotiation_started");
    expect(eventos).toHaveLength(1);
  });
});

describe("ranking considera corretamente lançamentos e estornos", () => {
  it("saldo do SDR soma só os lançamentos ativos depois de um ciclo estorno→reocorrência", async () => {
    // Outros testes deste arquivo compartilham a mesma empresa e já deixaram regras ativas
    // pro perfil sdr (handoff.won, handoff.contrato_assinado) — a comparação é contra a soma
    // real do ledger ativo, não um número fixo, pra não depender da ordem/isolamento dos
    // outros testes e continuar validando exatamente o que importa: ranking = ledger - estornos.
    const negocioId = await criarNegocio("Negócio ranking", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);
    await criarRegra("handoff.won", 30, "Ranking handoff.won");

    await marcarStatus(negocioId, "ganho", closer.cliente);
    await marcarStatus(negocioId, "aberto", closer.cliente);
    await marcarStatus(negocioId, "ganho", closer.cliente);

    const { data: ledgerAtivo } = await servico
      .from("point_ledger")
      .select("xp")
      .eq("membro_id", membro[sdr1.id])
      .eq("profile_at_event", "sdr")
      .eq("estornado", false);
    const somaEsperada = ledgerAtivo!.reduce((soma, l) => soma + l.xp, 0);

    const { data: ranking, error } = await closer.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    expect(error).toBeNull();
    const linhaSdr = ranking!.find((r) => r.membro_id === membro[sdr1.id]);
    // Só os lançamentos ativos entram na soma — o(s) estornado(s) do ciclo acima ficam de fora.
    expect(linhaSdr!.total_xp).toBe(somaEsperada);
    expect(somaEsperada).toBeGreaterThan(0);
  });
});
