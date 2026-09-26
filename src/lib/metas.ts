import type { MetricaMeta } from "@/lib/tipos";

export type Meta = {
  id: string;
  titulo: string;
  metrica: MetricaMeta;
  membroId: string;
  periodoInicio: string;
  periodoFim: string;
  valorAlvo: number;
  ativa: boolean;
};

export type ProgressoMeta = {
  realizado: number;
  percentual: number;
  faltante: number;
  diasTotais: number;
  diasPassados: number;
  diasRestantes: number;
  mediaDiariaRealizada: number;
  necessarioPorDiaRestante: number | null;
  projecaoFinal: number;
};

function paraDataUtc(isoData: string) {
  return new Date(`${isoData}T00:00:00Z`);
}

function diferencaDias(inicio: Date, fim: Date) {
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Início (inclusivo) e fim (exclusivo) do período em ISO, prontos para filtrar colunas timestamptz. */
export function limitesPeriodo(periodoInicio: string, periodoFim: string) {
  return {
    inicioIso: paraDataUtc(periodoInicio).toISOString(),
    fimExclusivoIso: new Date(paraDataUtc(periodoFim).getTime() + 86_400_000).toISOString(),
  };
}

/** Progresso de uma meta a partir do valor já realizado (calculado por quem consulta o banco). Função pura. */
export function calcularProgresso(valorAlvo: number, realizado: number, periodoInicio: string, periodoFim: string, hoje = new Date()): ProgressoMeta {
  const inicio = paraDataUtc(periodoInicio);
  const fim = paraDataUtc(periodoFim);
  const hojeUtc = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const diasTotais = diferencaDias(inicio, fim) + 1;

  const diasPassados = hojeUtc < inicio ? 0 : Math.min(diferencaDias(inicio, hojeUtc < fim ? hojeUtc : fim) + 1, diasTotais);
  const diasRestantes = Math.max(diasTotais - diasPassados, 0);

  const faltante = Math.max(valorAlvo - realizado, 0);
  const mediaDiariaRealizada = diasPassados > 0 ? realizado / diasPassados : 0;

  return {
    realizado,
    percentual: valorAlvo > 0 ? (realizado / valorAlvo) * 100 : 0,
    faltante,
    diasTotais,
    diasPassados,
    diasRestantes,
    mediaDiariaRealizada,
    necessarioPorDiaRestante: diasRestantes > 0 ? faltante / diasRestantes : null,
    projecaoFinal: mediaDiariaRealizada * diasTotais,
  };
}
