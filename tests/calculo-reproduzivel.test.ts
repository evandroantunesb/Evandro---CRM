/**
 * M2-Q1 (B): o cálculo gravado precisa ser reproduzível. O consumo usado é o que o Postgres numeric(10,2)
 * gravará (2 casas, half away from zero sobre o valor decimal) e calcular(entradaDaLinha(linha)) devolve
 * exatamente os resultados gravados na linha.
 *
 * Assinatura de `linhaDeCalculo`/`entradaDaLinha` vem do contrato provisório de Jay; ajustar só nomes/importações.
 */
import { describe, expect, it } from "vitest";
import { calcular } from "@/lib/calculadora";
import { consumoComoPersistido, entradaDaLinha, linhaDeCalculo } from "@/lib/calculo-reproduzivel";

const EMPRESA = "00000000-0000-0000-0000-0000000000aa";

const PARAMETROS = {
  produtividade_kwh_kwp_mes: 120,
  percentual_fio_b: 0.45,
  disponibilidade_mono_kwh: 30,
  disponibilidade_bi_kwh: 50,
  disponibilidade_tri_kwh: 100,
};

const ENTRADA_BASE = {
  kitNome: "Kit 10 kWp",
  potenciaKwp: 10,
  precoKit: 30000,
  tipoLigacao: "bifasico" as "monofasico" | "bifasico" | "trifasico",
  consumoMedioKwh: 1200 as number | null,
  valorFaturaMedio: null as number | null,
  tarifaKwh: 0.9,
};

function montar(sobrescrever: Partial<typeof ENTRADA_BASE> = {}) {
  const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, ...sobrescrever }, PARAMETROS);
  if (!r.ok) throw new Error(`linhaDeCalculo recusou entrada válida: ${r.mensagem}`);
  return r.linha;
}

/** Resultados gravados na linha, no formato de ResultadoCalculo. */
function resultadosGravados(linha: ReturnType<typeof montar>) {
  return {
    geracaoEstimadaKwhMes: linha.geracao_estimada_kwh_mes,
    kwhFaturado: linha.kwh_faturado,
    kwhCompensado: linha.kwh_compensado,
    custoFioB: linha.custo_fio_b,
    contaSemSolar: linha.conta_sem_solar,
    contaComSolar: linha.conta_com_solar,
    economiaMensal: linha.economia_mensal,
    paybackMeses: linha.payback_meses,
  };
}

describe("consumoComoPersistido (numeric(10,2), half away from zero, semântica decimal)", () => {
  it.each([
    [1200.555, 1200.56],
    [1200.554, 1200.55],
    [1200.5, 1200.5],
    [0.005, 0.01],
    [1.005, 1.01], // Math.round(1.005 * 100) / 100 daria 1,00: detecta erro de ponto flutuante
    [2.675, 2.68],
    [1111.111111, 1111.11],
  ])("%s -> %s", (entrada, esperado) => {
    expect(consumoComoPersistido(entrada)).toBe(esperado);
  });

  it.each([0, 1, 1200, 99999999])("inteiro %s fica inalterado", (n) => {
    expect(consumoComoPersistido(n)).toBe(n);
  });

  it("é idempotente", () => {
    for (const v of [1200.555, 1.005, 0.005, 2.675, 1111.111111, 1200, 0.1 + 0.2, 123.456789]) {
      const uma = consumoComoPersistido(v);
      expect(consumoComoPersistido(uma)).toBe(uma);
    }
  });
});

describe("linhaDeCalculo: consumo e reprodução", () => {
  it("consumo informado com casas excedentes: grava com 2 casas e reproduz o cálculo", () => {
    const linha = montar({ consumoMedioKwh: 1200.555 });
    expect(linha.consumo_medio_kwh).toBe(1200.56);
    // Oráculo independente: calcular() sobre o consumo já persistido.
    expect(resultadosGravados(linha)).toEqual(
      calcular({
        potenciaKwp: 10,
        precoKit: 30000,
        tipoLigacao: "bifasico",
        consumoMedioKwh: 1200.56,
        tarifaKwh: 0.9,
        produtividadeKwhKwpMes: 120,
        percentualFioB: 0.45,
        disponibilidadeKwh: 50,
      }),
    );
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("consumo estimado por fatura / tarifa: 1000 / 0,90 grava 1111,11", () => {
    const linha = montar({ consumoMedioKwh: null, valorFaturaMedio: 1000 });
    expect(linha.consumo_medio_kwh).toBe(1111.11);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
    expect(entradaDaLinha(linha).consumoMedioKwh).toBe(1111.11);
  });

  it("consumo já com 2 casas permanece inalterado", () => {
    const linha = montar({ consumoMedioKwh: 1200.55 });
    expect(linha.consumo_medio_kwh).toBe(1200.55);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("consumo informado vence a fatura", () => {
    const linha = montar({ consumoMedioKwh: 500, valorFaturaMedio: 1000 });
    expect(linha.consumo_medio_kwh).toBe(500);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it.each([
    ["monofasico", 30],
    ["bifasico", 50],
    ["trifasico", 100],
  ] as const)("tipo %s usa a disponibilidade correspondente (%s kWh) e reproduz", (tipoLigacao, disp) => {
    // Consumo baixo, perto da disponibilidade, para a escolha da disponibilidade alterar o resultado.
    const linha = montar({ tipoLigacao, consumoMedioKwh: 1100.005 });
    const entrada = entradaDaLinha(linha);
    expect(entrada.disponibilidadeKwh).toBe(disp);
    expect(entrada.tipoLigacao).toBe(tipoLigacao);
    expect(entrada.produtividadeKwhKwpMes).toBe(120);
    expect(entrada.percentualFioB).toBe(0.45);
    expect(entrada.tarifaKwh).toBe(0.9);
    expect(entrada.potenciaKwp).toBe(10);
    expect(entrada.precoKit).toBe(30000);
    expect(calcular(entrada)).toEqual(resultadosGravados(linha));
  });

  it("sistema que cobre todo o consumo reproduz também (faturado = disponibilidade)", () => {
    const linha = montar({ potenciaKwp: 50, precoKit: 200000, consumoMedioKwh: 800.005 });
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("sem economia: payback nulo é reproduzido como nulo", () => {
    const linha = montar({ potenciaKwp: 0.1, consumoMedioKwh: 40, tarifaKwh: 0.01 });
    expect(linha.payback_meses).toBeNull();
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });
});

describe("linhaDeCalculo: validações", () => {
  it("sem consumo nem fatura devolve ok:false com mensagem", () => {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, consumoMedioKwh: null, valorFaturaMedio: null }, PARAMETROS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem.length).toBeGreaterThan(0);
  });

  it.each([0, -1])("potência %s devolve ok:false com mensagem", (potenciaKwp) => {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, potenciaKwp }, PARAMETROS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem.length).toBeGreaterThan(0);
  });
});
