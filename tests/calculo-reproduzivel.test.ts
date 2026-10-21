/**
 * M2-Q1 (B): o cálculo gravado precisa ser reproduzível. O consumo usado é o que o Postgres numeric(10,2)
 * gravará (2 casas, half away from zero sobre o valor decimal) e calcular(entradaDaLinha(linha)) devolve
 * exatamente os resultados gravados na linha.
 *
 * Assinatura de `linhaDeCalculo`/`entradaDaLinha` vem do contrato provisório de Jay; ajustar só nomes/importações.
 */
import { describe, expect, it } from "vitest";
import { calcular, sugerirQuantidadeModulos } from "@/lib/calculadora";
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

/**
 * ACHADO A1 (pendente de decisão do Evandro): consumo digitado x consumo gravado nos limites de módulos.
 *
 * `dimensionarSistema` cobre 100% do consumo e arredonda os módulos para cima. Com produtividade 120 kWh/kWp/mês e
 * módulo de 620 W, 16 módulos cobrem exatamente 120 x 0,62 x 16 = 1190,4 kWh. Um consumo digitado de 1190,404 pede 17
 * módulos; mas o banco grava 1190,40 (numeric(10,2)) e o dimensionamento refeito a partir do consumo gravado pede 16.
 * Ou seja, o kit sugerido a partir do valor digitado (17) e o dimensionamento reproduzido do dado salvo (16) divergem.
 * Estes testes CARACTERIZAM o comportamento atual; não afirmam qual é o correto. Se o Evandro decidir que o
 * dimensionamento também deve usar o consumo como persistido, os valores "17" abaixo mudam para "16" (e vice-versa).
 */
describe("ACHADO A1: dimensionamento nos limites de quantidade de módulos x consumo persistido", () => {
  const PRODUTIVIDADE = 120;
  const MODULO_W = 620;
  const modulos = (consumo: number) => sugerirQuantidadeModulos(consumo, PRODUTIVIDADE, MODULO_W);

  it("limite exato: 1190,4 kWh cobre 16 módulos; 1190,40 gravado idem", () => {
    expect(modulos(1190.4)).toBe(16);
    expect(consumoComoPersistido(1190.4)).toBe(1190.4);
  });

  it("1190,404 digitado pede 17 módulos, o gravado (1190,40) pede 16: DIVERGÊNCIA caracterizada", () => {
    const digitado = 1190.404;
    const gravado = consumoComoPersistido(digitado);
    expect(gravado).toBe(1190.4);
    expect(modulos(digitado)).toBe(17);
    expect(modulos(gravado)).toBe(16);
    expect(modulos(digitado)).not.toBe(modulos(gravado));
  });

  it("1190,396 (abaixo do limite) arredonda para cima até 1190,40 e continua em 16: sem divergência", () => {
    expect(consumoComoPersistido(1190.396)).toBe(1190.4);
    expect(modulos(1190.396)).toBe(16);
    expect(modulos(consumoComoPersistido(1190.396))).toBe(16);
  });

  it("1190,405 arredonda para 1190,41 e ambos pedem 17: sem divergência", () => {
    expect(consumoComoPersistido(1190.405)).toBe(1190.41);
    expect(modulos(1190.405)).toBe(17);
    expect(modulos(consumoComoPersistido(1190.405))).toBe(17);
  });

  it("a divergência só ocorre em (limite, limite + 0,005) quando o limite tem até 2 casas: varredura 1..40 módulos", () => {
    // Limite do módulo k: 74,4 x k kWh (2 casas). Consumo logo acima do limite que arredonda para o próprio limite.
    const divergentes: number[] = [];
    for (let k = 1; k <= 40; k++) {
      const limite = Number((74.4 * k).toFixed(2));
      const digitado = Number((limite + 0.004).toFixed(3));
      if (modulos(digitado) !== modulos(consumoComoPersistido(digitado))) divergentes.push(k);
    }
    // Hoje diverge em TODOS os limites (digitado -> k+1; gravado -> k). Não é afirmação de correção.
    expect(divergentes).toHaveLength(40);
  });

  it("a linha gravada reproduz o resultado de `calcular`, mas o kit (potência) vem de quem montou: o consumo gravado é 1190,40", () => {
    const linha = linhaDeCalculo(
      EMPRESA,
      { ...ENTRADA_BASE, potenciaKwp: 17 * 0.62, consumoMedioKwh: 1190.404, tarifaKwh: 0.9 },
      PARAMETROS,
    );
    expect(linha.ok).toBe(true);
    if (!linha.ok) return;
    expect(linha.linha.consumo_medio_kwh).toBe(1190.4);
    expect(linha.linha.kit_potencia_kwp).toBe(17 * 0.62);
  });
});
