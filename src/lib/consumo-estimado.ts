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

/** Consumo que o servidor usa no cálculo: nunca derivado da tarifa base. */
export type ConsumoResolvido =
  | { ok: true; kwh: number; origem: "informado" | "estimado" }
  | { ok: false; motivo: "falta_tarifa_efetiva" | "sem_consumo" };

/**
 * Consumo usado ao CRIAR o negócio e ao SALVAR o kit (servidor). kWh informado vence; senão recalcula a estimativa a
 * partir do valor da conta e da tarifa EFETIVA recebida (nunca confia num consumo estimado vindo do navegador).
 * Valor da conta sem tarifa efetiva NÃO cai na tarifa base (TE + TUSD): sem ela, o cálculo não é feito.
 */
export function resolverConsumo(entrada: {
  consumoKwh: number | null;
  valorConta: number | null;
  tarifaEfetiva: number | null;
}): ConsumoResolvido {
  if (entrada.consumoKwh != null && entrada.consumoKwh > 0) return { ok: true, kwh: entrada.consumoKwh, origem: "informado" };
  if (entrada.valorConta == null || !(entrada.valorConta > 0)) return { ok: false, motivo: "sem_consumo" };
  const kwh = entrada.tarifaEfetiva != null ? estimarConsumoPelaConta(entrada.valorConta, entrada.tarifaEfetiva) : null;
  return kwh != null ? { ok: true, kwh, origem: "estimado" } : { ok: false, motivo: "falta_tarifa_efetiva" };
}

export const MENSAGEM_FALTA_TARIFA_EFETIVA =
  "Informe a tarifa efetiva estimada (R$/kWh): sem o consumo em kWh, ela é usada para estimar o consumo a partir do valor da fatura. A tarifa base (TE + TUSD) não é usada para isso.";

/**
 * Colunas de `negocios` que guardam o consumo resolvido: informado vai em `consumo_medio_kwh` e descarta a estimativa;
 * estimado vai nas duas colunas novas e deixa `consumo_medio_kwh` vazio. A tarifa efetiva só é gravada com a estimativa.
 */
export function colunasDeConsumo(
  consumo: ConsumoResolvido,
  tarifaEfetiva: number | null,
): { consumo_medio_kwh: number | null; consumo_estimado_kwh: number | null; tarifa_efetiva_kwh: number | null } | null {
  if (!consumo.ok) return null;
  if (consumo.origem === "informado") return { consumo_medio_kwh: consumo.kwh, consumo_estimado_kwh: null, tarifa_efetiva_kwh: null };
  return { consumo_medio_kwh: null, consumo_estimado_kwh: consumo.kwh, tarifa_efetiva_kwh: tarifaEfetiva };
}

/** Origem do consumo de um negócio ao reabrir. */
export type ConsumoSalvo =
  | { origem: "informado"; kwh: number }
  | { origem: "estimado"; kwh: number; tarifaEfetiva: number }
  /** Negócio anterior ao registro da origem: há consumo no cálculo, mas não se sabe se foi informado ou estimado. */
  | { origem: "desconhecida"; kwhNoCalculo: number }
  | null;

/**
 * Lê a origem do que está gravado, sem deduzir nada:
 * - estimativa registrada (`consumo_estimado_kwh` + `tarifa_efetiva_kwh`) → estimado;
 * - kWh em `consumo_medio_kwh` → informado;
 * - nenhum dos dois, mas há cálculo → DESCONHECIDA (não se infere pela igualdade com fatura ÷ tarifa);
 * - nada → null.
 */
export function consumoSalvoDoNegocio(entrada: {
  consumoMedioKwh: number | null;
  consumoEstimadoKwh: number | null;
  tarifaEfetivaKwh: number | null;
  calculo: { consumoMedioKwh: number } | null;
}): ConsumoSalvo {
  if (entrada.consumoEstimadoKwh != null && entrada.tarifaEfetivaKwh != null) {
    return { origem: "estimado", kwh: entrada.consumoEstimadoKwh, tarifaEfetiva: entrada.tarifaEfetivaKwh };
  }
  if (entrada.consumoMedioKwh != null) return { origem: "informado", kwh: entrada.consumoMedioKwh };
  return entrada.calculo ? { origem: "desconhecida", kwhNoCalculo: entrada.calculo.consumoMedioKwh } : null;
}

export const MENSAGEM_ORIGEM_DESCONHECIDA =
  "A origem do consumo deste cálculo não foi registrada (kit anterior). Antes de recalcular, informe o consumo em kWh que consta na fatura ou a tarifa efetiva estimada.";

/** Trocar um kWh informado por uma estimativa só por ação explícita do usuário em "Dados do negócio" (limpando o kWh). */
export const MENSAGEM_TROCA_INFORMADO_POR_ESTIMADO =
  "Este negócio tem consumo informado em kWh. Para estimá-lo pela fatura, primeiro limpe o consumo em “Dados do negócio” (ação explícita); o kWh informado não é apagado ao salvar o kit.";
