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
let equipeId: string;

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
  equipeId = equipe!.id;
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipeId, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipeId, membro_id: membro[closer.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipeId, membro_id: membro[closer2.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipeId, membro_id: membro[sdr1.id], e_gestor: false },
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

async function confirmarPagamento(contratoId: string) {
  const { error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
  if (error) throw error;
}

async function estornarPagamento(contratoId: string, motivo = "estorno de teste") {
  const { error } = await gestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contratoId, p_motivo: motivo });
  if (error) throw error;
}

async function contarMarco(marco: string, membroId: string, perfilRequerido: "sdr" | "closer" | "cs_farmer" | null = null) {
  const { data, error } = await admin.cliente.rpc("contar_marco_membro", {
    p_marco: marco,
    p_empresa_id: empresa,
    p_membro_id: membroId,
    p_ativa_desde: "1970-01-01T00:00:00Z",
    p_perfil_requerido: perfilRequerido ?? undefined,
  });
  if (error) throw error;
  return data as number;
}

async function adicionarMembroEquipe(userId: string, papel: "admin" | "gestor" | "vendedor" | "sdr", perfilGamificacao: "sdr" | "closer" | "cs_farmer") {
  const { data, error } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: userId, papel, perfil_gamificacao: perfilGamificacao })
    .select("id")
    .single();
  if (error) throw error;
  await servico.from("equipe_membros").insert({ empresa_id: empresa, equipe_id: equipeId, membro_id: data!.id, e_gestor: false });
  return data!.id as string;
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

describe("marco_contagem: pagamento.confirmado — reocorrência e permanência (sem contar dobrado o mesmo contrato)", () => {
  // Cada teste usa um membro novo: contarMarco() soma TODOS os contratos ao vivo do
  // membro (é assim que a contagem real pra threshold de conquista funciona), então
  // reaproveitar `closer` entre os `it`s acumularia os pagamentos confirmados de testes
  // anteriores e invalidaria o "conta só 1" de cada cenário isolado.
  let contadorPagamento = 0;
  async function criarClienteBeneficiario() {
    contadorPagamento += 1;
    const usuario = await criarUsuario(`cm-pag-${contadorPagamento}`);
    const membroId = await adicionarMembroEquipe(usuario.id, "vendedor", "closer");
    membro[usuario.id] = membroId;
    return { usuario, membroId };
  }

  it("pagamento confirmado conta 1 pro responsável congelado na assinatura", async () => {
    const { usuario, membroId } = await criarClienteBeneficiario();
    const negocioId = await criarNegocio("Pagamento conta 1", membroId);
    const contratoId = await criarEAssinarContrato(negocioId, usuario.cliente);
    await confirmarPagamento(contratoId);
    expect(await contarMarco("pagamento.confirmado", membroId)).toBe(1);
  });

  it("pagamento confirmado → estornado: deixa de contar pra avaliação futura (estado ao vivo)", async () => {
    const { usuario, membroId } = await criarClienteBeneficiario();
    const negocioId = await criarNegocio("Pagamento estornado", membroId);
    const contratoId = await criarEAssinarContrato(negocioId, usuario.cliente);
    await confirmarPagamento(contratoId);
    expect(await contarMarco("pagamento.confirmado", membroId)).toBe(1);

    await estornarPagamento(contratoId);
    expect(await contarMarco("pagamento.confirmado", membroId)).toBe(0);
  });

  it("confirmado → estornado → reconfirmado: o mesmo contrato continua valendo só 1, nunca 2", async () => {
    const { usuario, membroId } = await criarClienteBeneficiario();
    const negocioId = await criarNegocio("Pagamento reconfirmado", membroId);
    const contratoId = await criarEAssinarContrato(negocioId, usuario.cliente);

    await confirmarPagamento(contratoId);
    await estornarPagamento(contratoId);
    await confirmarPagamento(contratoId);

    expect(await contarMarco("pagamento.confirmado", membroId)).toBe(1);
  });

  it("múltiplos ciclos de confirma/estorna no mesmo contrato nunca fazem ele valer mais de 1", async () => {
    const { usuario, membroId } = await criarClienteBeneficiario();
    const negocioId = await criarNegocio("Pagamento múltiplos ciclos", membroId);
    const contratoId = await criarEAssinarContrato(negocioId, usuario.cliente);

    for (let i = 0; i < 3; i++) {
      await confirmarPagamento(contratoId);
      await estornarPagamento(contratoId);
    }
    await confirmarPagamento(contratoId);

    expect(await contarMarco("pagamento.confirmado", membroId)).toBe(1);
  });

  it("conquista já desbloqueada permanece desbloqueada mesmo depois do pagamento ser estornado", async () => {
    const { usuario, membroId } = await criarClienteBeneficiario();
    const conquistaId = await criarConquistaMarco({ nome: `Permanece após estorno ${contadorPagamento}`, marco: "pagamento.confirmado", valor: 1 });
    const negocioId = await criarNegocio("Pagamento permanência", membroId);
    const contratoId = await criarEAssinarContrato(negocioId, usuario.cliente);

    await confirmarPagamento(contratoId);
    expect(await desbloqueada(conquistaId, membroId)).toBe(true);

    await estornarPagamento(contratoId);
    expect(await desbloqueada(conquistaId, membroId)).toBe(true); // permanece, nunca é revogada
  });
});

describe("marco_contagem: bônus da conquista é XP-only (sem cascata por xp_acumulado)", () => {
  it("o bônus de uma conquista marco_contagem não é somado por avaliar_conquistas_pontos() e não desbloqueia conquista xp_acumulado sozinho", async () => {
    const { data: conquistaXp } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "XP acumulado (sem cascata)", criterio: { metrica: "xp_acumulado", valor: 50 }, xp_bonus: 0 })
      .select("id")
      .single();

    const conquistaMarcoId = await criarConquistaMarco({ nome: "Contrato (bônus 50)", marco: "contrato.assinado", valor: 1, xpBonus: 50 });
    const negocioId = await criarNegocio("Bônus sem cascata", membro[closer2.id]);
    await criarEAssinarContrato(negocioId, closer2.cliente);

    expect(await desbloqueada(conquistaMarcoId, membro[closer2.id])).toBe(true);
    // O bônus de 50 XP foi lançado, mas referencia_tipo='conquista' é excluído da soma que
    // avalia conquistas xp_acumulado (avaliar_conquistas_pontos()) — sem essa exclusão, os
    // mesmos 50 XP destravariam "XP acumulado (sem cascata)" nesse mesmo instante.
    expect(await desbloqueada(conquistaXp!.id, membro[closer2.id])).toBe(false);
  });
});

describe("marco_contagem: desbloqueio duplicado não duplica conquista nem notificação", () => {
  it("um 2º ciclo do marco após já desbloqueado não cria 2ª conquista nem 2ª notificação (a 1ª notificação sai no 1º desbloqueio)", async () => {
    const conquistaId = await criarConquistaMarco({ nome: "Pagamento confirmado (dedup)", marco: "pagamento.confirmado", valor: 1, xpBonus: 5 });
    const negocioId = await criarNegocio("Pagamento dedup", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    await confirmarPagamento(contratoId);
    expect(await desbloqueada(conquistaId, membro[closer.id])).toBe(true);

    const { data: notifsAntes } = await servico
      .from("notificacoes")
      .select("id")
      .eq("membro_id", membro[closer.id])
      .eq("tipo", "conquista_desbloqueada")
      .eq("mensagem", "Nova conquista desbloqueada: Pagamento confirmado (dedup)");
    expect(notifsAntes).toHaveLength(1); // criada já no 1º desbloqueio

    // Novo ciclo no mesmo contrato: reavalia a conquista, que já está desbloqueada.
    await estornarPagamento(contratoId);
    await confirmarPagamento(contratoId);

    const { data: desbloqueios } = await servico
      .from("conquistas_desbloqueadas")
      .select("id")
      .eq("conquista_id", conquistaId)
      .eq("membro_id", membro[closer.id]);
    expect(desbloqueios).toHaveLength(1); // nunca uma 2ª conquista

    const { data: notifsDepois } = await servico
      .from("notificacoes")
      .select("id")
      .eq("membro_id", membro[closer.id])
      .eq("tipo", "conquista_desbloqueada")
      .eq("mensagem", "Nova conquista desbloqueada: Pagamento confirmado (dedup)");
    expect(notifsDepois).toHaveLength(1); // nunca uma 2ª notificação
  });
});

describe("marco_contagem: concorrência", () => {
  it("duas assinaturas concorrentes cruzando o limiar ao mesmo tempo não duplicam desbloqueio/bônus/notificação, e nenhuma emissão aborta", async () => {
    // Concorrência real (não simulada): dois requests HTTP paralelos ao Postgrest, cada um
    // sua própria transação no Postgres — mesmo padrão já usado em
    // gamificacao-niveis-conquistas.test.ts. A proteção é a constraint UNIQUE
    // (conquista_id, membro_id) + ON CONFLICT DO NOTHING no insert de
    // conquistas_desbloqueadas, nunca lock aplicacional.
    const conquistaId = await criarConquistaMarco({ nome: "Concorrência contrato", marco: "contrato.assinado", valor: 1, xpBonus: 3 });
    const negocioA = await criarNegocio("Concorrência A", membro[closer2.id]);
    const negocioB = await criarNegocio("Concorrência B", membro[closer2.id]);
    const { data: contratoA } = await closer2.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioA, conteudo: "x" }).select("id").single();
    const { data: contratoB } = await closer2.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioB, conteudo: "x" }).select("id").single();

    const resultados = await Promise.all([
      closer2.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoA!.id),
      closer2.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoB!.id),
    ]);
    expect(resultados.every((r) => r.error === null)).toBe(true); // nenhuma das duas emissões abortou a transação comercial

    const { data: desbloqueios } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquistaId).eq("membro_id", membro[closer2.id]);
    expect(desbloqueios).toHaveLength(1);

    const { data: bonus } = await servico
      .from("point_ledger")
      .select("id")
      .eq("referencia_tipo", "conquista")
      .eq("referencia_id", conquistaId)
      .eq("membro_id", membro[closer2.id]);
    expect(bonus).toHaveLength(1);

    const { data: notifs } = await servico
      .from("notificacoes")
      .select("id")
      .eq("membro_id", membro[closer2.id])
      .eq("tipo", "conquista_desbloqueada")
      .eq("mensagem", "Nova conquista desbloqueada: Concorrência contrato");
    expect(notifs).toHaveLength(1);
  });
});

describe("marco_contagem: perfil por ocorrência (causal/congelado), nunca o perfil atual do membro", () => {
  it("mudança de perfil sdr → closer não mistura ocorrências históricas: 8 como sdr, 2 como closer, nunca 10", async () => {
    const sdrTroca = await criarUsuario("cm-sdr-troca");
    const membroTroca = await adicionarMembroEquipe(sdrTroca.id, "sdr", "sdr");
    membro[sdrTroca.id] = membroTroca;

    for (let i = 0; i < 8; i++) {
      const negocioId = await criarNegocio(`Oportunidade sdr ${i}`, membroTroca);
      await enviarEAceitar(negocioId, sdrTroca, closer);
      await marcarStatus(negocioId, "ganho", closer.cliente);
    }
    expect(await contarMarco("handoff.won", membroTroca, "sdr")).toBe(8);
    expect(await contarMarco("handoff.won", membroTroca, "closer")).toBe(0);
    expect(await contarMarco("handoff.won", membroTroca, null)).toBe(8);

    // Promove o membro a closer — não reinterpreta as 8 ocorrências antigas como closer.
    await servico.from("empresa_membros").update({ perfil_gamificacao: "closer" }).eq("id", membroTroca);

    for (let i = 0; i < 2; i++) {
      const negocioId = await criarNegocio(`Oportunidade closer ${i}`, membroTroca);
      await enviarEAceitar(negocioId, sdrTroca, closer2);
      await marcarStatus(negocioId, "ganho", closer2.cliente);
    }
    expect(await contarMarco("handoff.won", membroTroca, "sdr")).toBe(8); // histórico sdr intacto
    expect(await contarMarco("handoff.won", membroTroca, "closer")).toBe(2); // nunca 10
    expect(await contarMarco("handoff.won", membroTroca, null)).toBe(10); // geral soma tudo

    const conquistaAlta = await criarConquistaMarco({
      nome: "10 handoffs como closer",
      marco: "handoff.won",
      valor: 10,
      perfilAplicavel: "closer",
      ativaDesde: "1970-01-01T00:00:00Z",
    });
    const conquistaBaixa = await criarConquistaMarco({
      nome: "2 handoffs como closer",
      marco: "handoff.won",
      valor: 2,
      perfilAplicavel: "closer",
      ativaDesde: "1970-01-01T00:00:00Z",
    });

    // Gatilho: um novo evento do marco reavalia as conquistas pro membro.
    const negocioGatilho = await criarNegocio("Gatilho reavaliação closer", membroTroca);
    await enviarEAceitar(negocioGatilho, sdrTroca, closer2);
    await marcarStatus(negocioGatilho, "ganho", closer2.cliente);

    expect(await desbloqueada(conquistaAlta, membroTroca)).toBe(false); // 3/10 como closer, nunca 10/10 (nunca soma as 8 sdr)
    expect(await desbloqueada(conquistaBaixa, membroTroca)).toBe(true); // 3/2 como closer já desbloqueia
  });

  it("alterar perfil_aplicavel de uma conquista existente não reaproveita ocorrências causais de outro perfil", async () => {
    const sdrTroca2 = await criarUsuario("cm-sdr-troca2");
    const membroTroca2 = await adicionarMembroEquipe(sdrTroca2.id, "sdr", "sdr");
    membro[sdrTroca2.id] = membroTroca2;

    for (let i = 0; i < 3; i++) {
      const negocioId = await criarNegocio(`Perfil sdr ${i}`, membroTroca2);
      await enviarEAceitar(negocioId, sdrTroca2, closer);
      await marcarStatus(negocioId, "ganho", closer.cliente);
    }
    await servico.from("empresa_membros").update({ perfil_gamificacao: "closer" }).eq("id", membroTroca2);
    for (let i = 0; i < 2; i++) {
      const negocioId = await criarNegocio(`Perfil closer ${i}`, membroTroca2);
      await enviarEAceitar(negocioId, sdrTroca2, closer2);
      await marcarStatus(negocioId, "ganho", closer2.cliente);
    }

    // Conquista nasce sem filtro de perfil (geral): 5 ocorrências (3 sdr + 2 closer).
    const conquistaId = await criarConquistaMarco({
      nome: "Perfil trocado depois de criada",
      marco: "handoff.won",
      valor: 1000, // nunca alcançável — só pra existir sem desbloquear ainda
      ativaDesde: "1970-01-01T00:00:00Z",
    });

    // Edição administrativa: muda perfil_aplicavel pra 'closer' depois dos fatos já existirem.
    await admin.cliente.from("conquistas").update({ perfil_aplicavel: "closer" }).eq("id", conquistaId);

    // A contagem causal pro perfil 'closer' é recalculada do zero a partir do dado
    // congelado de cada ocorrência — nunca herda ou soma as 3 ocorrências 'sdr' antigas.
    expect(await contarMarco("handoff.won", membroTroca2, "closer")).toBe(2);
    expect(await contarMarco("handoff.won", membroTroca2, "sdr")).toBe(3); // histórico sdr continua intacto e separado
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
