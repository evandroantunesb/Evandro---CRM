import type { CategoriaMaterial } from "./precos";

/*
 * Compras P4a: margem por categoria de material (20261130100000_compras_margens.sql). Venda sugerida de um material =
 * melhor custo atual × (1 + margem da categoria).
 */

/** Margem por categoria em fração (0,18 = 18%); categoria sem margem cadastrada = 0. */
export type MargensCategoria = Record<CategoriaMaterial, number>;
export const MARGENS_ZERADAS: MargensCategoria = { modulos: 0, inversores: 0, baterias: 0, estrutura: 0, cabos_protecao: 0, outros: 0 };

/** Venda sugerida de um material: custo × (1 + margem), em centavos arredondados. */
export function vendaSugerida(custo: number, margem: number) {
  return Math.round(custo * (1 + margem) * 100) / 100;
}

/** Margem digitada em % ("18", "18,5") → fração (0,185). Nulo = inválida (fora de 0% a 500%). */
export function lerMargemPercentual(texto: string): number | null {
  const n = Number(texto.trim().replace("%", "").replace(",", "."));
  if (!texto.trim() || !Number.isFinite(n) || n < 0 || n > 500) return null;
  return Math.round(n * 100) / 10000;
}

/** Fração → texto em % para o campo ("0.185" → "18,5"). */
export const margemEmTexto = (m: number) => (Math.round(m * 10000) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
