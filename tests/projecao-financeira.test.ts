import { describe, expect, it } from "vitest";
import { calcularFioBGd2 } from "@/lib/fio-b-gd2";
import {
  comTributos,
  fatorGeracao,
  METODO_PROJECAO_V1,
  percentualFioBProjecao,
  PREMISSAS_PROJECAO,
  projetarEconomia,
  type EntradaProjecao,
} from "@/lib/projecao-financeira";

/**
 * Cenário de conta fácil: a partir de 2029 (Fio B a 100%), sem reajuste, sem perda e sem tributos. Por mês:
 * C = E = 500 kWh, T = 1, N = 0,3, D = 30 → K = 500; sem solar = R$ 500; com solar = max(30, 500 × 0,3) = R$ 150;
 * economia = R$ 350 por mês, R$ 105.000 em 25 anos.
 */
const SIMPLES: EntradaProjecao = {
  consumoMensalKwh: 500,
  geracaoMensalKwh: 500,
  autoconsumoFracao: 0,
  tarifaSemTributosRsKwh: 1,
  fioBSemTributosRsKwh: 0.3,
  icms: 0,
  pisCofins: 0,
  custoDisponibilidadeKwh: 30,
  mesInicio: "2029-01",
  investimento: 35000,
  precoInversor: 4200,
  premissas: { reajusteAnual: 0, perdaPrimeiroAno: 0, perdaAnual: 0 },
};

/** Copel B1 residencial (REH 3.592/2026): TE R$ 310,85 + TUSD R$ 457,17 por MWh; Fio B R$ 214,5356 por MWh. */
const COPEL: EntradaProjecao = {
  consumoMensalKwh: 650,
  geracaoMensalKwh: 732,
  autoconsumoFracao: PREMISSAS_PROJECAO.autoconsumoResidencial,
  tarifaSemTributosRsKwh: 0.76802,
  fioBSemTributosRsKwh: 0.2145356,
  icms: PREMISSAS_PROJECAO.icmsPadrao,
  pisCofins: PREMISSAS_PROJECAO.pisCofinsPadrao,
  custoDisponibilidadeKwh: 30,
  mesInicio: "2026-12",
  investimento: 24500,
  precoInversor: 4000,
};

const ok = (e: EntradaProjecao) => {
  const r = projetarEconomia(e);
  if (!r.ok) throw new Error(r.motivo);
  return r;
};

describe("premissas aprovadas em 24/11/2026", () => {
  it("Fio B: 60% em 2026, 75% em 2027, 90% em 2028 (Lei 14.300) e 100% a partir de 2029; antes de 2026, nada", () => {
    expect([2025, 2026, 2027, 2028, 2029, 2040].map(percentualFioBProjecao)).toEqual([null, 0.6, 0.75, 0.9, 1, 1]);
  });

  it("perda do módulo: 1% no 1º ano e 0,4% ao ano, linear como a garantia (87,4% no ano 30)", () => {
    expect(fatorGeracao(1)).toBeCloseTo(0.99, 10);
    expect(fatorGeracao(2)).toBeCloseTo(0.986, 10);
    expect(fatorGeracao(30)).toBeCloseTo(0.874, 10);
  });

  it("tributos por dentro: Copel sem tributos R$ 0,768 vira cerca de R$ 1,047 com ICMS 19% e PIS/Cofins 7,63%", () => {
    expect(comTributos(0.76802, 0.19, 0.0763)).toBeCloseTo(1.04678, 4);
  });

  it("padrões: 25 anos, reajuste de 5%, troca do inversor no ano 12, autoconsumo residencial de 30%", () => {
    expect(PREMISSAS_PROJECAO).toMatchObject({ horizonteAnos: 25, reajusteAnual: 0.05, anoTrocaInversor: 12, autoconsumoResidencial: 0.3, icmsPadrao: 0.19, pisCofinsPadrao: 0.0763 });
  });
});

describe("projeção de conta fácil", () => {
  it("economia constante de R$ 350 por mês: payback no mês 100 e saldo final descontando o inversor", () => {
    const r = ok(SIMPLES);
    expect(r.metodo).toBe(METODO_PROJECAO_V1);
    expect(r.primeiroMes).toEqual({ contaSemSolar: 500, contaComSolar: 150, economia: 350 });
    expect(r.economiaPrimeiroAno).toBe(4200);
    expect(r.anos).toHaveLength(25);
    expect(r.economiaTotal).toBe(105000);
    expect(r.paybackMeses).toBe(100);
    expect(r.saldoFinal).toBe(105000 - 35000 - 4200);
    expect(r.motivoSemPayback).toBeNull();
    expect(r.anos[11]!.trocaInversor).toBe(4200);
    expect(r.anos.filter((a) => a.trocaInversor > 0)).toHaveLength(1);
  });

  it("a troca do inversor no início do ano 12 conta antes do payback quando ele ainda não veio", () => {
    // Até o fim do ano 11 (132 meses): 46.200 < 47.000. A troca soma 4.200: 51.200 ÷ 350 = 146,3 → mês 147.
    expect(ok({ ...SIMPLES, investimento: 47000 }).paybackMeses).toBe(147);
  });

  it("sem o preço do inversor, sai a economia mas não o payback nem o saldo", () => {
    const r = ok({ ...SIMPLES, precoInversor: null });
    expect(r.economiaTotal).toBe(105000);
    expect(r.paybackMeses).toBeNull();
    expect(r.saldoFinal).toBeNull();
    expect(r.anos.every((a) => a.saldoAcumulado === null && a.trocaInversor === 0)).toBe(true);
    expect(r.motivoSemPayback).toBe("inversor_sem_preco");
  });

  it("sem o valor do negócio, sai a economia mas não o payback nem o saldo", () => {
    for (const investimento of [null, 0]) {
      const r = ok({ ...SIMPLES, investimento });
      expect(r.economiaTotal).toBe(105000);
      expect([r.paybackMeses, r.saldoFinal, r.motivoSemPayback]).toEqual([null, null, "sem_investimento"]);
    }
  });

  it("investimento que não se paga em 25 anos fica sem payback, com o motivo", () => {
    const r = ok({ ...SIMPLES, investimento: 10_000_000 });
    expect(r.paybackMeses).toBeNull();
    expect(r.motivoSemPayback).toBe("nao_se_paga_no_horizonte");
  });

  it("o reajuste anual aumenta a economia de um ano para o outro na mesma proporção", () => {
    const r = ok({ ...SIMPLES, premissas: { ...SIMPLES.premissas, reajusteAnual: 0.05 } });
    // Cada conta mensal é arredondada ao centavo (regra aprovada em 21/10/2026): o ano difere da conta direta em centavos.
    expect(Math.abs(r.anos[1]!.economia - 4200 * 1.05)).toBeLessThan(0.12);
    expect(Math.abs(r.anos[2]!.economia - 4200 * 1.05 ** 2)).toBeLessThan(0.12);
  });
});

describe("projeção com a Copel", () => {
  it("o primeiro mês é o motor aprovado com tributos, autoconsumo, Fio B de 2026 e a perda do 1º ano", () => {
    const r = ok(COPEL);
    const T = comTributos(0.76802, 0.19, 0.0763);
    const N = 0.6 * comTributos(0.2145356, 0.19, 0.0763);
    const geracao = 732 * 0.99;
    const motor = calcularFioBGd2({ consumoTotalKwh: 650, geracaoTotalKwh: geracao, autoconsumoInstantaneoKwh: geracao * 0.3, tarifaCheiaRsKwh: T, custoDisponibilidadeKwh: 30, custoEnergiaCompensadaRsKwh: N });
    if (!motor.ok) throw new Error(motor.motivo);
    expect(r.primeiroMes).toEqual({ contaSemSolar: motor.contaSemSolar, contaComSolar: motor.contaComSolar, economia: motor.economiaMensal });
    expect(r.premissas.tarifaComTributosRsKwh).toBeCloseTo(T, 10);
  });

  it("o Fio B sobe com o ano civil: começando em dezembro de 2026, o 1º ano economiza menos que 12 vezes o 1º mês", () => {
    const r = ok(COPEL);
    expect(r.economiaPrimeiroAno).toBeLessThan(12 * r.primeiroMes.economia);
  });

  it("mais autoconsumo, menos Fio B pago e mais economia", () => {
    expect(ok(COPEL).economiaTotal).toBeGreaterThan(ok({ ...COPEL, autoconsumoFracao: 0 }).economiaTotal);
  });

  it("autoconsumo nunca passa do consumo", () => {
    const r = ok({ ...COPEL, consumoMensalKwh: 100, autoconsumoFracao: 1 });
    expect(r.primeiroMes.contaComSolar).toBeCloseTo(30 * comTributos(0.76802, 0.19, 0.0763), 1);
  });

  it("a perda do módulo reduz a geração ano a ano", () => {
    const r = ok(COPEL);
    expect(r.anos[0]!.geracaoKwh).toBeCloseTo(732 * 12 * 0.99, 1);
    expect(r.anos[24]!.geracaoKwh).toBeCloseTo(732 * 12 * (0.99 - 0.004 * 24), 1);
  });

  it("tem payback e saldo positivo em 25 anos", () => {
    const r = ok(COPEL);
    expect(r.paybackMeses).toBeGreaterThan(12);
    expect(r.paybackMeses).toBeLessThan(12 * 10);
    expect(r.saldoFinal).toBeGreaterThan(0);
  });
});

describe("entradas inválidas nunca viram número", () => {
  it.each<[string, Partial<EntradaProjecao>]>([
    ["mês inválido", { mesInicio: "2026-13" }],
    ["antes de 2026 (sem percentual do Fio B)", { mesInicio: "2025-06" }],
    ["autoconsumo acima de 100%", { autoconsumoFracao: 1.2 }],
    ["consumo zero", { consumoMensalKwh: 0 }],
    ["investimento negativo", { investimento: -1 }],
    ["preço do inversor negativo", { precoInversor: -1 }],
    ["tributos absurdos", { icms: 0.5, pisCofins: 0.2 }],
    ["número não finito", { geracaoMensalKwh: Number.NaN }],
  ])("%s", (_, troca) => {
    expect(projetarEconomia({ ...COPEL, ...troca }).ok).toBe(false);
  });
});
