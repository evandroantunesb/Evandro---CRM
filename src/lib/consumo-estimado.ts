/**
 * Consumo mensal do assistente de novo negócio (Etapa 1), sem React nem banco.
 *
 * Duas tarifas diferentes, que nunca se misturam:
 * - **tarifa efetiva estimada** (Etapa 1): valor da conta ÷ kWh faturados, com impostos. Serve SÓ para
 *   estimar o consumo quando o usuário informa o valor da conta em R$ em vez dos kWh;
 * - **tarifa base (TE + TUSD)** (Etapa 3): entra no cálculo financeiro do kit (economia e payback).
 *
 * Esta função só conhece a primeira. Mudar a tarifa financeira não muda o consumo nem o dimensionamento.
 */

export type ConsumoEtapa1 =
  | { origem: "informado"; kwh: number }
  | { origem: "estimado"; kwh: number; valorConta: number; tarifaEfetiva: number }
  | null;

/** Consumo estimado com 2 casas: o valor mostrado, usado no dimensionamento e enviado é o mesmo número. */
export function estimarConsumoPelaConta(valorConta: number, tarifaEfetiva: number): number | null {
  if (!(valorConta > 0) || !(tarifaEfetiva > 0)) return null;
  return Math.round((valorConta / tarifaEfetiva) * 100) / 100;
}

/** kWh informado direto vence; senão, valor da conta ÷ tarifa efetiva estimada; senão, nada. */
export function consumoDaEtapa1(entrada: {
  consumoKwh: number | null;
  valorConta: number | null;
  tarifaEfetiva: number | null;
}): ConsumoEtapa1 {
  if (entrada.consumoKwh != null && entrada.consumoKwh > 0) return { origem: "informado", kwh: entrada.consumoKwh };
  if (entrada.valorConta != null && entrada.tarifaEfetiva != null) {
    const kwh = estimarConsumoPelaConta(entrada.valorConta, entrada.tarifaEfetiva);
    if (kwh != null) return { origem: "estimado", kwh, valorConta: entrada.valorConta, tarifaEfetiva: entrada.tarifaEfetiva };
  }
  return null;
}

/** Resultado de resolver o consumo na criação do negócio (servidor): nunca derivado da tarifa base. */
export type ConsumoDeCriacao =
  | { ok: true; kwh: number; origem: "informado" | "estimado" }
  | { ok: false; motivo: "falta_tarifa_efetiva" | "sem_consumo" };

/**
 * Consumo que o servidor usa no cálculo salvo ao criar o negócio. Recalcula a estimativa a partir do valor da
 * conta e da tarifa EFETIVA recebida; não confia em nenhum "consumo estimado" enviado pelo navegador. Valor da
 * conta sem tarifa efetiva NÃO cai na tarifa base (TE + TUSD): sem ela, o cálculo não é feito.
 */
export function consumoParaCriacao(entrada: {
  consumoKwh: number | null;
  valorConta: number | null;
  tarifaEfetiva: number | null;
}): ConsumoDeCriacao {
  if (entrada.consumoKwh != null && entrada.consumoKwh > 0) return { ok: true, kwh: entrada.consumoKwh, origem: "informado" };
  if (entrada.valorConta == null || !(entrada.valorConta > 0)) return { ok: false, motivo: "sem_consumo" };
  const kwh = entrada.tarifaEfetiva != null ? estimarConsumoPelaConta(entrada.valorConta, entrada.tarifaEfetiva) : null;
  return kwh != null ? { ok: true, kwh, origem: "estimado" } : { ok: false, motivo: "falta_tarifa_efetiva" };
}

/**
 * Ao reabrir: o consumo do cálculo salvo veio da fatura (estimado) quando o negócio nunca teve kWh informado e o
 * cálculo guarda o valor da fatura. Sem um campo de origem gravado isto é uma inferência conservadora (kWh digitado
 * só na ficha, com a fatura, também aparece como "estimado": erra para o lado de não afirmar "informado").
 */
export function consumoDoCalculoEhEstimado(entrada: { consumoNegocioKwh: number | null; valorFaturaCalculo: number | null }): boolean {
  return entrada.consumoNegocioKwh == null && entrada.valorFaturaCalculo != null;
}
