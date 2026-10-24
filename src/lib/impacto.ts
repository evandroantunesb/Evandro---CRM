/**
 * Métricas humanas do resultado (autonomia e carbono evitado). Puras: a mesma conta no navegador e nos testes.
 * Não entram no cálculo financeiro nem são gravadas; só traduzem a geração estimada para o cliente.
 */

/**
 * Fator médio anual de emissão de CO₂ do Sistema Interligado Nacional (MCTI), em tCO₂/MWh — o mesmo que kg/kWh.
 * Último valor anual confirmado: 2023 (38,5 kg/MWh). Atualizar quando o MCTI publicar o ano seguinte no SIRENE.
 */
export const FATOR_EMISSAO_SIN = { tco2PorMwh: 0.0385, ano: 2023, fonte: "MCTI · fator médio do SIN" } as const;

/** Parte do consumo coberta pela geração, de 0 a 1 (nunca passa de 100%). Sem consumo ou geração: null. */
export function autonomia(geracaoKwhMes: number, consumoKwhMes: number): number | null {
  if (!(geracaoKwhMes > 0) || !(consumoKwhMes > 0) || !Number.isFinite(geracaoKwhMes) || !Number.isFinite(consumoKwhMes)) return null;
  return Math.min(1, geracaoKwhMes / consumoKwhMes);
}

/** CO₂ que a geração deixa de emitir na rede, em kg por ano (geração mensal × 12 × fator). */
export function carbonoEvitadoKgAno(geracaoKwhMes: number): number | null {
  if (!(geracaoKwhMes > 0) || !Number.isFinite(geracaoKwhMes)) return null;
  return Math.round(geracaoKwhMes * 12 * FATOR_EMISSAO_SIN.tco2PorMwh);
}
