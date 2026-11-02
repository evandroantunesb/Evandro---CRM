import type { CustoCategoria, EntradaFinanceiro } from "./tipos";

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
