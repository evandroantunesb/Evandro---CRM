/**
 * Eventos estruturalmente inelegíveis para XP/moedas: os de "atividade" (operacionais,
 * repetíveis sem limite natural) desde o fechamento de antifraude de 2026-10-02
 * (`20261002180000_gamificacao_antifraude_fechamento.sql`) e, desde a B1a
 * (`20261010100000_handoff_pontuacao_aceite.sql`), o envio e a devolução de oportunidade —
 * o repasse do SDR só pontua no aceite (`oportunidade_aceita`). O evento continua existindo e
 * nenhum histórico é apagado; só não é mais oferecido pra regra nova e o motor ignora
 * qualquer regra antiga desses tipos, mesmo que ainda esteja `ativa`.
 */
export const EVENTOS_NAO_PONTUAVEIS = [
  "deal.created",
  "deal.stage_changed",
  "deal.owner_changed",
  "task.created",
  "note.created",
  "handoff.created",
  "handoff.devolvido",
] as const;

/**
 * Eventos "atividade repetível" que continuam pontuáveis, mas só com teto configurado
 * (`limite_periodo` + `limite_quantidade`) — sem teto, o motor ignora a regra. Reunião/
 * visita não usam `unica_por_negocio` (um negócio pode legitimamente ter várias).
 */
export const EVENTOS_TETO_OBRIGATORIO = ["task.completed", "reuniao.realizada", "visita.realizada"] as const;

/** Tipos de evento que o CRM já publica em `eventos` e que podem virar regra de pontos. */
export const EVENTOS_GAMIFICACAO = [
  { tipo: "deal.created", rotulo: "Negócio criado", campos: [], naoPontuavel: true },
  { tipo: "deal.stage_changed", rotulo: "Negócio mudou de etapa", campos: [], naoPontuavel: true },
  { tipo: "deal.owner_changed", rotulo: "Negócio trocou de responsável", campos: [], naoPontuavel: true },
  { tipo: "deal.won", rotulo: "Negócio ganho", campos: ["valor"] },
  { tipo: "deal.lost", rotulo: "Negócio perdido", campos: [] },
  { tipo: "deal.reopened", rotulo: "Negócio reaberto", campos: [] },
  { tipo: "deal.negotiation_started", rotulo: "Negócio entrou em negociação", campos: [] },
  { tipo: "contrato.assinado", rotulo: "Contrato assinado", campos: [] },
  { tipo: "task.created", rotulo: "Tarefa criada", campos: ["tipo"], naoPontuavel: true },
  { tipo: "task.completed", rotulo: "Tarefa concluída", campos: ["tipo", "no_prazo", "resultado"] },
  { tipo: "reuniao.realizada", rotulo: "Reunião realizada", campos: [] },
  { tipo: "visita.realizada", rotulo: "Visita realizada", campos: [] },
  { tipo: "note.created", rotulo: "Nota registrada", campos: [], naoPontuavel: true },
  { tipo: "deal.qualified", rotulo: "Negócio qualificado", campos: [] },
  // Legado (fase 8, 2026-09-30): conclusão automática da tarefa "Realizar primeiro
  // contato", mesmo tipo de sinal autoatribuído e sem validação que o Evandro rejeitou
  // como `contato_efetivo` em 2026-10-01. Não confiável para gamificação — não oferecer
  // como opção de regra (`legado: true`), não tratar como equivalente a `contato_efetivo`.
  // Mantido no catálogo só por compatibilidade histórica (evento já publicado no passado).
  { tipo: "deal.first_contact_done", rotulo: "SDR: primeiro contato realizado (legado, não usar)", campos: [], legado: true },
  { tipo: "deal.energy_bill_received", rotulo: "SDR: conta de energia recebida", campos: [] },
  // B1a: envio e devolução ficam só como histórico; o repasse pontua no primeiro aceite.
  { tipo: "handoff.created", rotulo: "SDR: lead entregue para vendas (só histórico, não pontua)", campos: [], naoPontuavel: true },
  { tipo: "oportunidade_aceita", rotulo: "SDR: oportunidade aceita pelo closer (só o primeiro aceite do negócio)", campos: [] },
  { tipo: "handoff.devolvido", rotulo: "Closer devolveu a oportunidade (só histórico, não pontua)", campos: [], naoPontuavel: true },
  { tipo: "handoff.won", rotulo: "SDR: lead entregue que virou venda", campos: ["valor"] },
  { tipo: "handoff.contrato_assinado", rotulo: "SDR: contrato assinado da oportunidade originada", campos: [] },
  { tipo: "pagamento.confirmado", rotulo: "Pagamento confirmado", campos: [] },
] as const;

/** Eventos oferecidos para criar regra nova — exclui os marcados `legado` ou `naoPontuavel`. */
export const EVENTOS_GAMIFICACAO_SELECIONAVEIS = EVENTOS_GAMIFICACAO.filter(
  (e) => !("legado" in e && e.legado) && !("naoPontuavel" in e && e.naoPontuavel),
);

/** Se uma regra nova pode usar este evento (o motor nunca credita os demais). */
export function eventoAceitaRegraNova(tipo: string) {
  return EVENTOS_GAMIFICACAO_SELECIONAVEIS.some((e) => e.tipo === tipo);
}

/** Evento que o motor nunca credita (regra antiga desses tipos fica só como registro). */
export function eventoNaoPontuavel(tipo: string) {
  return (EVENTOS_NAO_PONTUAVEIS as readonly string[]).includes(tipo);
}

export type TipoEventoGamificacao = (typeof EVENTOS_GAMIFICACAO)[number]["tipo"];

export function rotuloEvento(tipo: string) {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.rotulo ?? tipo;
}

export function camposEvento(tipo: string): readonly string[] {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.campos ?? [];
}

/**
 * Marcos suportados por conquista do tipo `marco_contagem` (critério "N ocorrências de
 * um evento", independente de XP/moedas — ver `avaliar_conquistas_marco()`). Reunião e
 * visita realizadas ficam de fora até a PR #109 (`tarefas.resultado`) mesclar: não há
 * fonte causal aceitável hoje sem usar `task.completed` genérico.
 */
export const MARCOS_CONQUISTA = [
  "deal.qualified",
  "deal.negotiation_started",
  "contrato.assinado",
  "deal.won",
  "handoff.won",
  "pagamento.confirmado",
] as const;

export type MarcoConquista = (typeof MARCOS_CONQUISTA)[number];

export const ROTULO_MARCO_CONQUISTA: Record<MarcoConquista, string> = {
  "deal.qualified": "Negócio qualificado",
  "deal.negotiation_started": "Negócio entrou em negociação",
  "contrato.assinado": "Contrato assinado",
  "deal.won": "Negócio ganho",
  "handoff.won": "Oportunidade originada que virou venda (SDR)",
  "pagamento.confirmado": "Pagamento confirmado",
};

export type NivelGamificacao = { nivel: number; nome: string | null; xpMinimo: number };

/**
 * Fonte única do cálculo de nível (Evandro, 2026-10-02): antes, jornada/
 * ranking/dashboard calculavam nível cada um do seu jeito (um usava XP ativo
 * global, outro usava o total filtrado por perfil/período do ranking),
 * resultando em números diferentes pra mesma pessoa. Nível é sempre
 * progressão pessoal: XP ativo (não estornado) acumulado da vida toda do
 * membro, nunca filtrado por perfil ou período.
 */
/**
 * Atribuição causal congelada dos ganhos (Evandro, 2026-10-02, fechamento da auditoria
 * integrada): recebe eventos `deal.won` de um lote de negócios, já ordenados por
 * `created_at` desc, e devolve o `responsavel_id` congelado no evento mais recente de
 * cada negócio — nunca `negocios.responsavel_id` ao vivo, que pode ter trocado depois do
 * ganho (`deal.owner_changed` não gera novo `deal.won`). Reabertura seguida de novo ganho
 * é uma nova ocorrência de `deal.won`; como só entram aqui negócios com `status='ganho'`
 * (cujo último fechamento causal só pode ter sido `deal.won`), o evento mais recente de
 * cada negócio já É o fechamento ativo.
 */
export function responsavelCongeladoPorNegocio(
  eventosDealWonDescPorData: readonly { entidade_id: string | null; payload: unknown; created_at: string }[],
): Map<string, string | null> {
  const porNegocio = new Map<string, string | null>();
  for (const e of eventosDealWonDescPorData) {
    if (!e.entidade_id || porNegocio.has(e.entidade_id)) continue;
    const payload = e.payload as { responsavel_id?: string | null } | null;
    porNegocio.set(e.entidade_id, payload?.responsavel_id ?? null);
  }
  return porNegocio;
}

export function calcularNivel(niveis: readonly NivelGamificacao[], xpAtivo: number) {
  let atual: { nivel: number; nome: string | null } = { nivel: 1, nome: null };
  let proximo: NivelGamificacao | null = null;
  for (const n of niveis) {
    if (n.xpMinimo <= xpAtivo) atual = { nivel: n.nivel, nome: n.nome };
    else {
      proximo = n;
      break;
    }
  }
  const xpBaseNivel = niveis.find((n) => n.nivel === atual.nivel)?.xpMinimo ?? 0;
  const progresso = proximo ? Math.min(100, Math.round(((xpAtivo - xpBaseNivel) / (proximo.xpMinimo - xpBaseNivel)) * 100)) : 100;
  return { ...atual, xpBaseNivel, proximoNivel: proximo, progresso };
}
