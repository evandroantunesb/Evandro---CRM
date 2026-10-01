/** Tipos de evento que o CRM já publica em `eventos` e que podem virar regra de pontos. */
export const EVENTOS_GAMIFICACAO = [
  { tipo: "deal.created", rotulo: "Negócio criado", campos: [] },
  { tipo: "deal.stage_changed", rotulo: "Negócio mudou de etapa", campos: [] },
  { tipo: "deal.owner_changed", rotulo: "Negócio trocou de responsável", campos: [] },
  { tipo: "deal.won", rotulo: "Negócio ganho", campos: ["valor"] },
  { tipo: "deal.lost", rotulo: "Negócio perdido", campos: [] },
  { tipo: "deal.reopened", rotulo: "Negócio reaberto", campos: [] },
  { tipo: "task.created", rotulo: "Tarefa criada", campos: ["tipo"] },
  { tipo: "task.completed", rotulo: "Tarefa concluída", campos: ["no_prazo", "resultado"] },
  { tipo: "reuniao.realizada", rotulo: "Reunião realizada", campos: [] },
  { tipo: "visita.realizada", rotulo: "Visita realizada", campos: [] },
  { tipo: "note.created", rotulo: "Nota registrada", campos: [] },
  // Legado (fase 8, 2026-09-30): conclusão automática da tarefa "Realizar primeiro
  // contato", mesmo tipo de sinal autoatribuído e sem validação que o Evandro rejeitou
  // como `contato_efetivo` em 2026-10-01. Não confiável para gamificação — não oferecer
  // como opção de regra (`legado: true`), não tratar como equivalente a `contato_efetivo`.
  // Mantido no catálogo só por compatibilidade histórica (evento já publicado no passado).
  { tipo: "deal.first_contact_done", rotulo: "SDR: primeiro contato realizado (legado, não usar)", campos: [], legado: true },
  { tipo: "deal.energy_bill_received", rotulo: "SDR: conta de energia recebida", campos: [] },
  { tipo: "handoff.created", rotulo: "SDR: lead entregue para vendas", campos: [] },
  { tipo: "handoff.won", rotulo: "SDR: lead entregue que virou venda", campos: ["valor"] },
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
