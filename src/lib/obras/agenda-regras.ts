/**
 * Agenda operacional (item 4 do roadmap; prévia aprovada em 18/11/2026): regras puras de período (semana começa na
 * segunda; mês em grade de semanas inteiras), filtros e agrupamento por dia. Datas são "AAAA-MM-DD" (dia civil).
 */

export const TIPOS_EVENTO = ["instalacao", "vistoria", "entrega_material", "entrega_contratada"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ROTULO_TIPO: Record<TipoEvento, { plural: string; curto: string }> = {
  instalacao: { plural: "Instalações", curto: "Instalação" },
  vistoria: { plural: "Vistorias", curto: "Vistoria" },
  entrega_material: { plural: "Entrega do material", curto: "Material chega" },
  entrega_contratada: { plural: "Entrega contratada", curto: "Entrega contratada" },
};

export type EventoAgenda = {
  tipo: TipoEvento;
  obraId: string;
  obraNumero: number;
  clienteNome: string;
  inicio: string;
  fim: string;
  detalhe: string | null;
  equipeId: string | null;
  situacao: string | null;
  alerta: boolean;
};

export type ModoAgenda = "semana" | "mes";

const DIA = 24 * 60 * 60 * 1000;
const paraData = (d: string) => new Date(`${d}T12:00:00Z`);
const paraTexto = (d: Date) => d.toISOString().slice(0, 10);

export const ehDataValida = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(paraData(d).getTime()) && paraTexto(paraData(d)) === d;

export function somarDias(d: string, n: number): string {
  return paraTexto(new Date(paraData(d).getTime() + n * DIA));
}

/** Segunda-feira da semana de `d`. */
export function inicioSemana(d: string): string {
  const dow = paraData(d).getUTCDay(); // 0 = domingo
  return somarDias(d, dow === 0 ? -6 : 1 - dow);
}

export const diaDaSemana = (d: string) => paraData(d).getUTCDay();
export const fimDeSemana = (d: string) => diaDaSemana(d) === 0 || diaDaSemana(d) === 6;

/** Dias mostrados: 7 na semana; no mês, de segunda da 1ª semana até domingo da última (35 ou 42 dias). */
export function diasDoPeriodo(modo: ModoAgenda, d: string): string[] {
  if (modo === "semana") {
    const seg = inicioSemana(d);
    return Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  }
  const primeiro = `${d.slice(0, 7)}-01`;
  const ultimo = somarDias(`${somarDias(primeiro, 32).slice(0, 7)}-01`, -1);
  const de = inicioSemana(primeiro);
  const ate = somarDias(inicioSemana(ultimo), 6);
  const total = Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA) + 1;
  return Array.from({ length: total }, (_, i) => somarDias(de, i));
}

/** Data de referência do período anterior ou seguinte. */
export function navegar(modo: ModoAgenda, d: string, passo: -1 | 1): string {
  if (modo === "semana") return somarDias(inicioSemana(d), 7 * passo);
  const [ano, mes] = d.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + passo, 1, 12));
  return paraTexto(alvo);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SEMANA_LONGA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const nomeDiaCurto = (d: string) => SEMANA_CURTA[diaDaSemana(d)];
export const nomeDiaLongo = (d: string) => SEMANA_LONGA[diaDaSemana(d)];
export const diaDoMes = (d: string) => Number(d.slice(8, 10));

/** "16 a 22 de novembro", "28 de outubro a 3 de novembro" ou "Novembro de 2026". */
export function tituloPeriodo(modo: ModoAgenda, d: string): string {
  if (modo === "mes") {
    const [ano, mes] = d.split("-").map(Number);
    const nome = MESES[mes - 1];
    return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
  }
  const de = inicioSemana(d);
  const ate = somarDias(de, 6);
  const mDe = MESES[Number(de.slice(5, 7)) - 1];
  const mAte = MESES[Number(ate.slice(5, 7)) - 1];
  return mDe === mAte ? `${diaDoMes(de)} a ${diaDoMes(ate)} de ${mAte}` : `${diaDoMes(de)} de ${mDe} a ${diaDoMes(ate)} de ${mAte}`;
}

/** Eventos que tocam o dia, instalações primeiro (ocupam vários dias), depois por tipo e cliente. */
export function eventosDoDia(eventos: EventoAgenda[], dia: string): EventoAgenda[] {
  return eventos
    .filter((e) => e.inicio <= dia && e.fim >= dia)
    .sort((a, b) => TIPOS_EVENTO.indexOf(a.tipo) - TIPOS_EVENTO.indexOf(b.tipo) || a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
}

/** "2º de 3 dias" para instalação de vários dias (dias corridos do agendamento). */
export function diaDaInstalacao(e: EventoAgenda, dia: string): string | null {
  if (e.tipo !== "instalacao" || e.inicio === e.fim) return null;
  const n = Math.round((paraData(dia).getTime() - paraData(e.inicio).getTime()) / DIA) + 1;
  const total = Math.round((paraData(e.fim).getTime() - paraData(e.inicio).getTime()) / DIA) + 1;
  return `${n}º de ${total} dias`;
}

/** Filtros da URL: tipos ausentes = todos; equipe vazia = todas. */
export function filtrarEventos(eventos: EventoAgenda[], filtros: { tipos: TipoEvento[]; equipe: string | null }): EventoAgenda[] {
  return eventos.filter(
    (e) => (filtros.tipos.length === 0 || filtros.tipos.includes(e.tipo)) && (!filtros.equipe || e.tipo !== "instalacao" || e.equipeId === filtros.equipe),
  );
}

export function tiposDaUrl(valor: string | string[] | undefined): TipoEvento[] {
  const lista = (Array.isArray(valor) ? valor : (valor ?? "").split(",")).map((v) => v.trim());
  return TIPOS_EVENTO.filter((t) => lista.includes(t));
}
