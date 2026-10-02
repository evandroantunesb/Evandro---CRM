/** Tipos de evento que o CRM já publica em `eventos` e que podem virar regra de pontos. */
export const EVENTOS_GAMIFICACAO = [
  { tipo: "deal.created", rotulo: "Negócio criado", campos: [] },
  { tipo: "deal.stage_changed", rotulo: "Negócio mudou de etapa", campos: [] },
  { tipo: "deal.owner_changed", rotulo: "Negócio trocou de responsável", campos: [] },
  { tipo: "deal.won", rotulo: "Negócio ganho", campos: ["valor"] },
  { tipo: "deal.lost", rotulo: "Negócio perdido", campos: [] },
  { tipo: "deal.reopened", rotulo: "Negócio reaberto", campos: [] },
  { tipo: "deal.negotiation_started", rotulo: "Negócio entrou em negociação", campos: [] },
  { tipo: "contrato.assinado", rotulo: "Contrato assinado", campos: [] },
  { tipo: "task.created", rotulo: "Tarefa criada", campos: ["tipo"] },
  { tipo: "task.completed", rotulo: "Tarefa concluída", campos: ["tipo", "no_prazo", "resultado"] },
  { tipo: "reuniao.realizada", rotulo: "Reunião realizada", campos: [] },
  { tipo: "visita.realizada", rotulo: "Visita realizada", campos: [] },
  { tipo: "note.created", rotulo: "Nota registrada", campos: [] },
  { tipo: "deal.qualified", rotulo: "Negócio qualificado", campos: [] },
  // Legado (fase 8, 2026-09-30): conclusão automática da tarefa "Realizar primeiro
  // contato", mesmo tipo de sinal autoatribuído e sem validação que o Evandro rejeitou
  // como `contato_efetivo` em 2026-10-01. Não confiável para gamificação — não oferecer
  // como opção de regra (`legado: true`), não tratar como equivalente a `contato_efetivo`.
  // Mantido no catálogo só por compatibilidade histórica (evento já publicado no passado).
  { tipo: "deal.first_contact_done", rotulo: "SDR: primeiro contato realizado (legado, não usar)", campos: [], legado: true },
  { tipo: "deal.energy_bill_received", rotulo: "SDR: conta de energia recebida", campos: [] },
  { tipo: "handoff.created", rotulo: "SDR: lead entregue para vendas", campos: [] },
  { tipo: "oportunidade_aceita", rotulo: "SDR: oportunidade aceita pelo closer", campos: [] },
  { tipo: "handoff.devolvido", rotulo: "Closer devolveu a oportunidade", campos: [] },
  { tipo: "handoff.won", rotulo: "SDR: lead entregue que virou venda", campos: ["valor"] },
  { tipo: "handoff.contrato_assinado", rotulo: "SDR: contrato assinado da oportunidade originada", campos: [] },
  { tipo: "pagamento.confirmado", rotulo: "Pagamento confirmado", campos: [] },
] as const;

/** Eventos oferecidos para criar regra nova — exclui os marcados `legado`. */
export const EVENTOS_GAMIFICACAO_SELECIONAVEIS = EVENTOS_GAMIFICACAO.filter((e) => !("legado" in e && e.legado));

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
