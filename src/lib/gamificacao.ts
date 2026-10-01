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
  { tipo: "deal.first_contact_done", rotulo: "SDR: primeiro contato realizado", campos: [] },
  { tipo: "deal.energy_bill_received", rotulo: "SDR: conta de energia recebida", campos: [] },
  { tipo: "handoff.created", rotulo: "SDR: lead entregue para vendas", campos: [] },
  { tipo: "handoff.won", rotulo: "SDR: lead entregue que virou venda", campos: ["valor"] },
] as const;

export type TipoEventoGamificacao = (typeof EVENTOS_GAMIFICACAO)[number]["tipo"];

export function rotuloEvento(tipo: string) {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.rotulo ?? tipo;
}

export function camposEvento(tipo: string): readonly string[] {
  return EVENTOS_GAMIFICACAO.find((e) => e.tipo === tipo)?.campos ?? [];
}
