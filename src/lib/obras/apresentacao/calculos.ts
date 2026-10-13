import type { AtividadeCronograma, CustoCategoria, EntradaFinanceiro } from "./tipos";

/** Cálculos puros da Apresentação (sem banco, sem tela). */

export type DesvioCusto = CustoCategoria & {
  /** realizado − orçado (positivo = acima do orçado). */
  desvio: number;
  /** desvio / orçado em %, ou null se o orçado for 0. */
  desvioPct: number | null;
};

export function desvioCusto(c: CustoCategoria): DesvioCusto {
  const desvio = c.realizado - c.orcado;
  return { ...c, desvio, desvioPct: c.orcado === 0 ? null : (desvio / c.orcado) * 100 };
}

export function totaisCustos(custos: readonly CustoCategoria[]): { orcado: number; realizado: number } {
  return custos.reduce((t, c) => ({ orcado: t.orcado + c.orcado, realizado: t.realizado + c.realizado }), { orcado: 0, realizado: 0 });
}

export type ResultadoFinanceiro = EntradaFinanceiro & {
  /** Receita líquida − custo FINAL projetado (nunca receita − gasto até hoje). */
  margemLiquida: number;
  margemLiquidaPct: number | null;
  /** Quanto ainda falta gastar, pela projeção. */
  aRealizar: number;
  /** Custo final projetado − custo orçado. */
  desvioProjetado: number;
  /** Margem estimada − margem planejada, em pontos percentuais. */
  variacaoMargemPp: number | null;
};

export function resultadoFinanceiro(e: EntradaFinanceiro): ResultadoFinanceiro {
  const margemLiquida = e.receitaLiquida - e.custoFinalProjetado;
  const margemLiquidaPct = e.receitaLiquida === 0 ? null : (margemLiquida / e.receitaLiquida) * 100;
  return {
    ...e,
    margemLiquida,
    margemLiquidaPct,
    aRealizar: e.custoFinalProjetado - e.custoRealizado,
    desvioProjetado: e.custoFinalProjetado - e.custoOrcado,
    variacaoMargemPp: margemLiquidaPct == null || e.margemPlanejadaPct == null ? null : margemLiquidaPct - e.margemPlanejadaPct,
  };
}

/** Inconsistências que impedem mostrar um resultado (fonte errada não vira número na tela). */
export function inconsistenciasFinanceiro(e: EntradaFinanceiro, custos: readonly CustoCategoria[]): string[] {
  const problemas: string[] = [];
  const t = totaisCustos(custos);
  if (custos.length > 0 && Math.abs(t.orcado - e.custoOrcado) > 0.005) problemas.push("custo orçado ≠ soma das categorias");
  if (custos.length > 0 && Math.abs(t.realizado - e.custoRealizado) > 0.005) problemas.push("custo realizado ≠ soma das categorias");
  if (e.custoFinalProjetado < e.custoRealizado) problemas.push("custo final projetado menor que o já realizado");
  if ([e.receitaLiquida, e.custoOrcado, e.custoRealizado, e.custoFinalProjetado].some((v) => !Number.isFinite(v) || v < 0)) {
    problemas.push("valor negativo ou inválido");
  }
  return problemas;
}

// --- Cronograma ------------------------------------------------------------------

const DIA_MS = 86_400_000;

/** Dia (UTC, meia-noite) de uma data ISO AAAA-MM-DD. */
export const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type EscalaCronograma = {
  inicio: string;
  fim: string;
  totalDias: number;
  /** Segundas-feiras dentro do intervalo (rótulos de semana). */
  semanas: { inicio: string; deslocamento: number }[];
  /** Deslocamento (em dias) de hoje, ou null se hoje estiver fora do intervalo. */
  hoje: number | null;
};

/**
 * Escala do Gantt: do primeiro início ao último fim, com 1 dia de folga em cada ponta, e as
 * semanas começando na segunda. `hojeIso` vem de fora (testável e igual no servidor/cliente).
 */
export function escalaCronograma(atividades: readonly AtividadeCronograma[], hojeIso: string): EscalaCronograma | null {
  if (atividades.length === 0) return null;
  const ini = Math.min(...atividades.map((a) => dia(a.inicio))) - DIA_MS;
  const fim = Math.max(...atividades.map((a) => dia(a.fim))) + DIA_MS;
  const totalDias = Math.round((fim - ini) / DIA_MS) + 1;
  const semanas: EscalaCronograma["semanas"] = [];
  for (let d = ini; d <= fim; d += DIA_MS) {
    if (new Date(d).getUTCDay() === 1) semanas.push({ inicio: isoDe(d), deslocamento: Math.round((d - ini) / DIA_MS) });
  }
  const h = dia(hojeIso);
  return { inicio: isoDe(ini), fim: isoDe(fim), totalDias, semanas, hoje: h >= ini && h <= fim ? Math.round((h - ini) / DIA_MS) : null };
}

/** Posição de uma atividade na escala (dias desde o início e duração, inclusiva). */
export function posicaoAtividade(a: AtividadeCronograma, escala: EscalaCronograma): { deslocamento: number; duracao: number } {
  const ini = dia(escala.inicio);
  return { deslocamento: Math.round((dia(a.inicio) - ini) / DIA_MS), duracao: Math.round((dia(a.fim) - dia(a.inicio)) / DIA_MS) + 1 };
}

/** Atrasada: o fim previsto já passou e a fonte não informa 100%. */
export const atividadeAtrasada = (a: AtividadeCronograma, hojeIso: string) => a.progresso < 100 && dia(a.fim) < dia(hojeIso);
