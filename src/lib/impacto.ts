/**
 * Métricas humanas do resultado (autonomia). Puras: a mesma conta no navegador e nos testes.
 * Não entram no cálculo financeiro nem são gravadas; só traduzem a geração estimada para o cliente.
 */

/** Parte do consumo coberta pela geração, de 0 a 1 (nunca passa de 100%). Sem consumo ou geração: null. */
export function autonomia(geracaoKwhMes: number, consumoKwhMes: number): number | null {
  if (!(geracaoKwhMes > 0) || !(consumoKwhMes > 0) || !Number.isFinite(geracaoKwhMes) || !Number.isFinite(consumoKwhMes)) return null;
  return Math.min(1, geracaoKwhMes / consumoKwhMes);
}
