/** Tipos de evento que o CRM já publica em `eventos` e que podem virar regra de pontos. */
export const EVENTOS_GAMIFICACAO = [
  { tipo: "deal.created", rotulo: "Negócio criado", campos: [] },
  { tipo: "deal.stage_changed", rotulo: "Negócio mudou de etapa", campos: [] },
  { tipo: "deal.owner_changed", rotulo: "Negócio trocou de responsável", campos: [] },
  { tipo: "deal.won", rotulo: "Negócio ganho", campos: ["valor"] },
  { tipo: "deal.lost", rotulo: "Negócio perdido", campos: [] },
  { tipo: "deal.reopened", rotulo: "Negócio reaberto", campos: [] },
  { tipo: "task.created", rotulo: "Tarefa criada", campos: [] },
  { tipo: "task.completed", rotulo: "Tarefa concluída", campos: ["no_prazo"] },
  { tipo: "note.created", rotulo: "Nota registrada", campos: [] },
] as const;

export type TipoEventoGamificacao = (typeof EVENTOS_GAMIFICACAO)[number]["tipo"];

export function rotuloEvento(tipo: string) {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.rotulo ?? tipo;
}

export function camposEvento(tipo: string): readonly string[] {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.campos ?? [];
}
