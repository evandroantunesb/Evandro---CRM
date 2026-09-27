import type { SupabaseServidor } from "@/lib/supabase/server";
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

/** Realizado de uma meta: consulta negócios/tarefas do colaborador no período, respeitando o RLS de sempre. */
export async function calcularRealizado(supabase: SupabaseServidor, meta: Meta) {
  const { inicioIso, fimExclusivoIso } = limitesPeriodo(meta.periodoInicio, meta.periodoFim);

  if (meta.metrica === "receita" || meta.metrica === "negocios_ganhos") {
    const { data } = await supabase
      .from("negocios")
      .select("valor")
      .eq("responsavel_id", meta.membroId)
      .eq("status", "ganho")
      .gte("fechado_em", inicioIso)
      .lt("fechado_em", fimExclusivoIso)
      .limit(10000);
    const linhas = data ?? [];
    return meta.metrica === "receita" ? linhas.reduce((soma, n) => soma + (n.valor ?? 0), 0) : linhas.length;
  }

  if (meta.metrica === "conversao") {
    const { data } = await supabase
      .from("negocios")
      .select("status")
      .eq("responsavel_id", meta.membroId)
      .in("status", ["ganho", "perdido"])
      .gte("fechado_em", inicioIso)
      .lt("fechado_em", fimExclusivoIso)
      .limit(10000);
    const linhas = data ?? [];
    const ganhos = linhas.filter((n) => n.status === "ganho").length;
    return linhas.length > 0 ? (ganhos / linhas.length) * 100 : 0;
  }

  // reunioes | tarefas_concluidas
  let consulta = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("responsavel_id", meta.membroId)
    .not("concluida_em", "is", null)
    .gte("concluida_em", inicioIso)
    .lt("concluida_em", fimExclusivoIso);
  if (meta.metrica === "reunioes") consulta = consulta.eq("tipo", "reuniao");
  const { count } = await consulta;
  return count ?? 0;
}
