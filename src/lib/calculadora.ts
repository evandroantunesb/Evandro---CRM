import type { TipoLigacao } from "@/lib/tipos";

export type EntradaCalculo = {
  potenciaKwp: number;
  precoKit: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  tarifaKwh: number;
  produtividadeKwhKwpMes: number;
  percentualFioB: number;
  disponibilidadeKwh: number;
};

export type ResultadoCalculo = {
  geracaoEstimadaKwhMes: number;
  kwhFaturado: number;
  kwhCompensado: number;
  custoFioB: number;
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  /** Nulo quando o sistema não gera economia (kit pequeno demais ou tarifa muito baixa). */
  paybackMeses: number | null;
};

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Calculadora solar — modo comercial.
 *
 * Estimativa simplificada (sem simulação horária/pvlib): usa uma produtividade
 * média (kWh por kWp por mês) e desconta da conta o custo de disponibilidade
 * mínimo e o Fio B (Lei 14.300) sobre a energia compensada. Não considera
 * banco de créditos entre meses nem sazonalidade — o vendedor deve tratar o
 * resultado como uma estimativa comercial, não um projeto de engenharia.
 */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const { potenciaKwp, consumoMedioKwh, tarifaKwh, produtividadeKwhKwpMes, percentualFioB, disponibilidadeKwh } =
    entrada;

  const geracaoEstimadaKwhMes = potenciaKwp * produtividadeKwhKwpMes;

  // A concessionária sempre cobra pelo menos o custo de disponibilidade (em
  // kWh), mesmo quando a geração cobre todo o consumo.
  let kwhFaturado = Math.max(consumoMedioKwh - geracaoEstimadaKwhMes, disponibilidadeKwh);
  kwhFaturado = Math.min(kwhFaturado, consumoMedioKwh);
  const kwhCompensado = Math.max(consumoMedioKwh - kwhFaturado, 0);

  const custoFioB = kwhCompensado * tarifaKwh * percentualFioB;
  const contaSemSolar = consumoMedioKwh * tarifaKwh;
  const contaComSolar = kwhFaturado * tarifaKwh + custoFioB;
  const economiaMensal = contaSemSolar - contaComSolar;

  return {
    geracaoEstimadaKwhMes: arredondar(geracaoEstimadaKwhMes, 2),
    kwhFaturado: arredondar(kwhFaturado, 2),
    kwhCompensado: arredondar(kwhCompensado, 2),
    custoFioB: arredondar(custoFioB, 2),
    contaSemSolar: arredondar(contaSemSolar, 2),
    contaComSolar: arredondar(contaComSolar, 2),
    economiaMensal: arredondar(economiaMensal, 2),
    paybackMeses: economiaMensal > 0 ? arredondar(entrada.precoKit / economiaMensal, 1) : null,
  };
}

export const DISPONIBILIDADE_PADRAO: Record<TipoLigacao, "disponibilidade_mono_kwh" | "disponibilidade_bi_kwh" | "disponibilidade_tri_kwh"> = {
  monofasico: "disponibilidade_mono_kwh",
  bifasico: "disponibilidade_bi_kwh",
  trifasico: "disponibilidade_tri_kwh",
};
