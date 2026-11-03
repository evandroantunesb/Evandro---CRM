/**
 * Fração gravada (0,57) → texto do campo em porcentagem, pt-BR ("57", "57,5", "12,34").
 * Elimina o resíduo de ponto flutuante de `fracao * 100` (0,57 * 100 = 56,99999999999999) arredondando
 * a até 6 casas na porcentagem, e nunca gera separador de milhar nem notação científica.
 * O texto volta por `lerNumeroBr` sem mudar o valor.
 */
export function percentualParaCampo(fracao: number): string {
  if (!Number.isFinite(fracao)) return "";
  const porcentagem = Number((fracao * 100).toFixed(6));
  return porcentagem.toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: false });
}
