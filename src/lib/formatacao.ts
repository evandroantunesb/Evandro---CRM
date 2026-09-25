// Funções puras de formatação (datas, moeda, prazos). Sem "server-only": usadas
// tanto em Server Components quanto em componentes de cliente (ex.: calculadora.tsx).

export function formatarMoeda(valor: number | null | undefined) {
  if (valor == null) return "";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Data e hora curtas para prazos: "hoje 14:00", "amanhã 09:30", "12/10 16:00". */
export function formatarPrazo(iso: string, agora = Date.now()) {
  const fuso = "America/Sao_Paulo";
  const dia = (t: number | string) => new Date(t).toLocaleDateString("pt-BR", { timeZone: fuso });
  const hora = new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso });
  if (dia(iso) === dia(agora)) return `hoje ${hora}`;
  if (dia(iso) === dia(agora + 86400000)) return `amanhã ${hora}`;
  if (dia(iso) === dia(agora - 86400000)) return `ontem ${hora}`;
  const curta = new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: fuso });
  return `${curta} ${hora}`;
}

/** Situação de um prazo em relação a hoje (fuso de Brasília). */
export function situacaoPrazo(iso: string, agora = Date.now()): "atrasada" | "hoje" | "futura" {
  if (new Date(iso).getTime() < agora) return "atrasada";
  const dia = (t: number | string) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return dia(iso) === dia(agora) ? "hoje" : "futura";
}

/** "2026-10-12T14:00" (campo datetime-local, horário de Brasília) para ISO. */
export function prazoParaIso(local: string) {
  return new Date(`${local}:00-03:00`).toISOString();
}

/** "há 3 dias", usado no card do Kanban. */
export function tempoDesde(iso: string, agora = Date.now()) {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
