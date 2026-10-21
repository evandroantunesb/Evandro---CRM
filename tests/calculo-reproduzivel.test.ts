/**
 * M2-Q1/Q2 (B): o cálculo gravado precisa ser reproduzível. Cada entrada persistida é normalizada para a escala da
 * coluna do Postgres (half away from zero sobre o valor decimal) ANTES de calcular e é gravada já normalizada;
 * calcular(entradaDaLinha(linha)) devolve exatamente os resultados gravados na linha.
 *
 * Escalas (migration 20260926000100_calculadora.sql): tarifa_kwh numeric(8,4), kit_potencia_kwp numeric(6,2),
 * kit_preco numeric(12,2), valor_fatura_medio numeric(12,2), consumo_medio_kwh numeric(10,2).
 *
 * Decisões D1 e D2 de Nora (autorizada pelo Evandro) estão registradas nos blocos correspondentes abaixo.
 */
import { describe, expect, it } from "vitest";
import { calcular, dimensionarSistema, sugerirQuantidadeModulos } from "@/lib/calculadora";
import {
  MENSAGEM_ESTIMATIVA_INCOMPLETA,
  consumoComoPersistido,
  entradaDaLinha,
  linhaDeCalculo,
} from "@/lib/calculo-reproduzivel";

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

  // ALTERADO (requisito aprovado pelo Evandro): antes derivava consumo = fatura / tarifa base (1111,11);
  // agora conta em R$ sem kWh e sem tarifa efetiva = estimativa incompleta, sem derivar consumo.
  it("conta em R$ sem consumo em kWh: estimativa incompleta, nao deriva consumo de fatura / tarifa base", () => {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, consumoMedioKwh: null, valorFaturaMedio: 1000 }, PARAMETROS);
    expect(r).toEqual({ ok: false, incompleta: true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA });
    expect(r).not.toHaveProperty("linha");
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

/**
 * D2 (decidido por Nora, autorizada pelo Evandro): `linhaDeCalculo` normaliza tarifa (4 casas), potência, preço e
 * fatura (2 casas) ANTES de calcular e grava normalizado; o consumo é consumoComoPersistido(informado ?? fatura
 * persistida / tarifa persistida). Os valores esperados abaixo são a regra de escala do banco (half away from zero
 * decimal) calculada à mão, e o cálculo é conferido contra `calcular` sobre as entradas normalizadas.
 */
describe("D2: linhaDeCalculo normaliza as entradas persistidas e grava normalizado", () => {
  function oraculo(linha: ReturnType<typeof montar>) {
    return calcular({
      potenciaKwp: linha.kit_potencia_kwp,
      precoKit: linha.kit_preco,
      tipoLigacao: linha.tipo_ligacao as "monofasico" | "bifasico" | "trifasico",
      consumoMedioKwh: linha.consumo_medio_kwh,
      tarifaKwh: linha.tarifa_kwh,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.45,
      disponibilidadeKwh: linha.disponibilidade_kwh,
    });
  }

  it("tarifa 0,123456 grava 0,1235 e o cálculo usa 0,1235", () => {
    const linha = montar({ tarifaKwh: 0.123456 });
    expect(linha.tarifa_kwh).toBe(0.1235);
    const esperado = calcular({
      potenciaKwp: 10,
      precoKit: 30000,
      tipoLigacao: "bifasico",
      consumoMedioKwh: 1200,
      tarifaKwh: 0.1235,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.45,
      disponibilidadeKwh: 50,
    });
    expect(resultadosGravados(linha)).toEqual(esperado);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("tarifa 0,95231 grava 0,9523 e reproduz", () => {
    const linha = montar({ tarifaKwh: 0.95231 });
    expect(linha.tarifa_kwh).toBe(0.9523);
    expect(resultadosGravados(linha)).toEqual(oraculo(linha));
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  // ALTERADO (requisito aprovado pelo Evandro): o consumo nao e mais derivado de fatura / tarifa base.
  // Antes: consumo null + fatura 1000 + tarifa 0,95231 => consumo 1050,09. Agora o consumo e o INFORMADO (1050,09 aqui
  // so como valor de teste); a tarifa continua normalizada e a fatura gravada 1000.
  it("fatura 1000 com tarifa 0,95231 e consumo informado: tarifa normalizada 0,9523, fatura 1000, consumo intocado", () => {
    const linha = montar({ consumoMedioKwh: 1050.09, valorFaturaMedio: 1000, tarifaKwh: 0.95231 });
    expect(linha.tarifa_kwh).toBe(0.9523);
    expect(linha.consumo_medio_kwh).toBe(1050.09);
    expect(linha.valor_fatura_medio).toBe(1000);
    expect(resultadosGravados(linha)).toEqual(oraculo(linha));
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  // ALTERADO: antes, consumo null + fatura 1000,005 + tarifa 0,5 => fatura 1000,01 e consumo 2000,02 (derivado).
  // Agora, com consumo informado, a fatura continua gravada normalizada e o consumo nao e derivado dela.
  it("fatura com casas excedentes é gravada normalizada; consumo informado não parte da fatura", () => {
    const linha = montar({ consumoMedioKwh: 1500, valorFaturaMedio: 1000.005, tarifaKwh: 0.5 });
    expect(linha.valor_fatura_medio).toBe(1000.01);
    expect(linha.consumo_medio_kwh).toBe(1500);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  // ALTERADO: antes, consumo null + fatura 999,995 + tarifa 0,7 => fatura 1000 e consumo 1428,57 (derivado).
  it("fatura 999,995 -> 1000 gravada; consumo informado não é derivado da fatura", () => {
    const linha = montar({ consumoMedioKwh: 1300, valorFaturaMedio: 999.995, tarifaKwh: 0.7 });
    expect(linha.valor_fatura_medio).toBe(1000);
    expect(linha.consumo_medio_kwh).toBe(1300);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it.each([
    [1000, 0.95231],
    [1000.005, 0.5],
    [999.995, 0.7],
  ])("fatura %s e tarifa %s sem consumo em kWh: estimativa incompleta (nunca consumo derivado)", (fatura, tarifa) => {
    const r = linhaDeCalculo(
      EMPRESA,
      { ...ENTRADA_BASE, consumoMedioKwh: null, valorFaturaMedio: fatura, tarifaKwh: tarifa },
      PARAMETROS,
    );
    expect(r).toEqual({ ok: false, incompleta: true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA });
  });

  it("valor_fatura_medio nulo continua nulo", () => {
    expect(montar({ consumoMedioKwh: 1200, valorFaturaMedio: null }).valor_fatura_medio).toBeNull();
  });

  it("potência 5,505 grava 5,51 e preço 20000,005 grava 20000,01; o cálculo usa os normalizados", () => {
    const linha = montar({ potenciaKwp: 5.505, precoKit: 20000.005 });
    expect(linha.kit_potencia_kwp).toBe(5.51);
    expect(linha.kit_preco).toBe(20000.01);
    expect(resultadosGravados(linha)).toEqual(oraculo(linha));
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("potência 6,1 e preço 19999,995 (-> 20000): valores normalizados e reprodução", () => {
    const linha = montar({ potenciaKwp: 6.1, precoKit: 19999.995 });
    expect(linha.kit_potencia_kwp).toBe(6.1);
    expect(linha.kit_preco).toBe(20000);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
  });

  it("todas as entradas com excesso de casas ao mesmo tempo: reproduz e refazer da linha dá a mesma linha", () => {
    const linha = montar({ potenciaKwp: 7.775, precoKit: 25999.995, tarifaKwh: 0.95231, consumoMedioKwh: 987.655 });
    expect(linha.kit_potencia_kwp).toBe(7.78);
    expect(linha.kit_preco).toBe(26000);
    expect(linha.tarifa_kwh).toBe(0.9523);
    expect(linha.consumo_medio_kwh).toBe(987.66);
    expect(calcular(entradaDaLinha(linha))).toEqual(resultadosGravados(linha));
    const refeita = montar({
      kitNome: linha.kit_nome,
      potenciaKwp: linha.kit_potencia_kwp,
      precoKit: linha.kit_preco,
      tarifaKwh: linha.tarifa_kwh,
      consumoMedioKwh: linha.consumo_medio_kwh,
      valorFaturaMedio: linha.valor_fatura_medio ?? null,
    });
    expect(refeita).toEqual(linha);
  });

  it("preço 0 é aceito (>= 0) e payback fica nulo", () => {
    const linha = montar({ precoKit: 0 });
    expect(linha.kit_preco).toBe(0);
    expect(linha.payback_meses).toBeNull();
  });
});

describe("linhaDeCalculo: validações e ordem dos erros", () => {
  const ERRO_ENTRADA = "Informe o consumo médio ou o valor médio da fatura.";
  const ERRO_POTENCIA = "Informe ao menos um módulo com potência para calcular.";
  const ERRO_TARIFA = "Informe uma tarifa maior que zero (o banco guarda 4 casas).";
  const ERRO_PRECO = "Informe um preço do kit válido (maior ou igual a zero).";
  const ERRO_CONSUMO = "Informe um consumo maior que zero (o banco guarda 2 casas).";
  const ERRO_PARAMETROS = "Parâmetros da calculadora não configurados.";

  function mensagem(sobrescrever: Partial<typeof ENTRADA_BASE>, parametros: typeof PARAMETROS | null = PARAMETROS) {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, ...sobrescrever }, parametros);
    expect(r.ok).toBe(false);
    return r.ok ? null : r.mensagem;
  }

  it("sem consumo nem fatura", () => {
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: null })).toBe(ERRO_ENTRADA);
  });

  it.each([0, -1])("potência %s", (potenciaKwp) => {
    expect(mensagem({ potenciaKwp })).toBe(ERRO_POTENCIA);
  });

  it("potência 0,004 (normaliza para 0) devolve o erro de potência", () => {
    expect(mensagem({ potenciaKwp: 0.004 })).toBe(ERRO_POTENCIA);
  });

  it("potência 0,005 (normaliza para 0,01) é aceita", () => {
    expect(montar({ potenciaKwp: 0.005 }).kit_potencia_kwp).toBe(0.01);
  });

  it("tarifa 0,00004 (normaliza para 0) devolve o erro de tarifa; 0 e negativa também", () => {
    expect(mensagem({ tarifaKwh: 0.00004 })).toBe(ERRO_TARIFA);
    expect(mensagem({ tarifaKwh: 0 })).toBe(ERRO_TARIFA);
    expect(mensagem({ tarifaKwh: -0.5 })).toBe(ERRO_TARIFA);
  });

  it("tarifa 0,00005 (normaliza para 0,0001) é aceita", () => {
    expect(montar({ tarifaKwh: 0.00005 }).tarifa_kwh).toBe(0.0001);
  });

  it("preço -1 devolve o erro de preço", () => {
    expect(mensagem({ precoKit: -1 })).toBe(ERRO_PRECO);
  });

  it("consumo informado 0,004 (normaliza para 0) devolve o erro de consumo", () => {
    expect(mensagem({ consumoMedioKwh: 0.004 })).toBe(ERRO_CONSUMO);
  });

  it("consumo informado 0 devolve o erro de consumo", () => {
    expect(mensagem({ consumoMedioKwh: 0 })).toBe(ERRO_CONSUMO);
  });

  // ALTERADO: antes devolvia ERRO_CONSUMO (consumo derivado = 0). Sem derivacao, conta em R$ sem kWh e
  // estimativa incompleta, mesmo com fatura que normaliza para 0.
  it("fatura 0,004 com tarifa 1 sem consumo em kWh devolve estimativa incompleta (não mais o erro de consumo)", () => {
    const r = linhaDeCalculo(
      EMPRESA,
      { ...ENTRADA_BASE, consumoMedioKwh: null, valorFaturaMedio: 0.004, tarifaKwh: 1 },
      PARAMETROS,
    );
    expect(r).toEqual({ ok: false, incompleta: true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA });
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 0.004, tarifaKwh: 1 })).not.toBe(ERRO_CONSUMO);
  });

  it("estimativa incompleta não é erro de entrada: só aparece com entrada válida (potência, tarifa e preço ok)", () => {
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, potenciaKwp: 0 })).toBe(ERRO_POTENCIA);
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, tarifaKwh: 0 })).toBe(ERRO_TARIFA);
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, precoKit: -1 })).toBe(ERRO_PRECO);
  });

  it("parâmetros nulos com entrada válida devolvem o erro de parâmetros", () => {
    expect(mensagem({}, null)).toBe(ERRO_PARAMETROS);
  });

  describe("ordem: (1) entrada, (2) potência, (3) tarifa, (4) preço, (5) consumo, (6) parâmetros", () => {
    it("potência inválida e parâmetros nulos: erro de potência, não o de parâmetros", () => {
      expect(mensagem({ potenciaKwp: 0 }, null)).toBe(ERRO_POTENCIA);
      expect(mensagem({ potenciaKwp: 0.004 }, null)).toBe(ERRO_POTENCIA);
    });

    it("sem consumo/fatura e potência inválida: erro de entrada vem primeiro", () => {
      expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: null, potenciaKwp: 0 })).toBe(ERRO_ENTRADA);
    });

    it("potência e tarifa inválidas: potência primeiro", () => {
      expect(mensagem({ potenciaKwp: 0.004, tarifaKwh: 0 })).toBe(ERRO_POTENCIA);
    });

    it("tarifa e preço inválidos: tarifa primeiro", () => {
      expect(mensagem({ tarifaKwh: 0.00004, precoKit: -1 })).toBe(ERRO_TARIFA);
    });

    it("preço e consumo inválidos: preço primeiro", () => {
      expect(mensagem({ precoKit: -1, consumoMedioKwh: 0.004 })).toBe(ERRO_PRECO);
    });

    it("consumo inválido e parâmetros nulos: erro de consumo", () => {
      expect(mensagem({ consumoMedioKwh: 0.004 }, null)).toBe(ERRO_CONSUMO);
    });

    it("tarifa inválida e parâmetros nulos: erro de tarifa", () => {
      expect(mensagem({ tarifaKwh: 0 }, null)).toBe(ERRO_TARIFA);
    });
  });
});

/**
 * ACHADO A1 — DECIDIDO (D1, Nora autorizada pelo Evandro): `dimensionarSistema` normaliza o consumo com
 * `consumoComoPersistido` na entrada, ou seja, dimensiona com o consumo COMO SERÁ GRAVADO. Antes da decisão, o
 * dimensionamento usava o consumo digitado e divergia do dimensionamento refeito do dado salvo (1190,404 -> 17 x 16).
 *
 * Com produtividade 120 kWh/kWp/mês e módulo de 620 W, 16 módulos cobrem exatamente 120 x 0,62 x 16 = 1190,4 kWh:
 * 1190,396 -> 16; 1190,40 -> 16; 1190,404 -> 16 (antes 17); 1190,405 -> 17 (vira 1190,41); 1190,41 -> 17;
 * consumo 0,004 normaliza para 0 e devolve null (antes dava 1 módulo). Entrada inválida continua null.
 */
describe("A1 (decidido em D1): dimensionamento usa o consumo como persistido", () => {
  const PRODUTIVIDADE = 120;
  const MODULO_W = 620;
  const modulos = (consumo: number) => sugerirQuantidadeModulos(consumo, PRODUTIVIDADE, MODULO_W);

  it.each([
    [1190.396, 16],
    [1190.4, 16],
    [1190.404, 16],
    [1190.405, 17],
    [1190.41, 17],
  ])("consumo %s -> %s módulos", (consumo, esperado) => {
    expect(modulos(consumo)).toBe(esperado);
  });

  it("1190,404 digitado e o gravado (1190,40) dão o mesmo número de módulos (a divergência acabou)", () => {
    const gravado = consumoComoPersistido(1190.404);
    expect(gravado).toBe(1190.4);
    expect(modulos(1190.404)).toBe(modulos(gravado));
  });

  it("consumo 0,004 normaliza para 0 e devolve null (antes dava 1 módulo)", () => {
    expect(consumoComoPersistido(0.004)).toBe(0);
    expect(modulos(0.004)).toBeNull();
    expect(dimensionarSistema(0.004, PRODUTIVIDADE, MODULO_W)).toBeNull();
  });

  it("consumo 0,005 normaliza para 0,01 e dá 1 módulo", () => {
    expect(modulos(0.005)).toBe(1);
  });

  it.each([
    [0, 120, 620],
    [-5, 120, 620],
    [Number.NaN, 120, 620],
    [1000, 0, 620],
    [1000, -1, 620],
    [1000, 120, 0],
    [1000, 120, -620],
    [1000, Number.NaN, 620],
    [1000, 120, Number.NaN],
  ])("entrada inválida (consumo %s, produtividade %s, módulo %s) continua null", (c, p, m) => {
    expect(sugerirQuantidadeModulos(c, p, m)).toBeNull();
    expect(dimensionarSistema(c, p, m)).toBeNull();
  });

  // Achado resolvido (M2-Q2): consumo não finito devolvia quantidade Infinity; agora devolve null.
  it("consumo +Infinity devolve null (entrada não finita)", () => {
    expect(sugerirQuantidadeModulos(Number.POSITIVE_INFINITY, 120, 620)).toBeNull();
  });

  // D1/Nora: entrada inválida ou não finita -> null, direto em dimensionarSistema.
  it.each([
    ["consumo +Infinity", Number.POSITIVE_INFINITY, 120, 620],
    ["consumo -Infinity", Number.NEGATIVE_INFINITY, 120, 620],
    ["consumo NaN", Number.NaN, 120, 620],
    ["produtividade +Infinity", 1200, Number.POSITIVE_INFINITY, 620],
    ["produtividade NaN", 1200, Number.NaN, 620],
    ["potência do módulo +Infinity", 1200, 120, Number.POSITIVE_INFINITY],
    ["potência do módulo NaN", 1200, 120, Number.NaN],
  ])("dimensionarSistema: %s devolve null", (_rotulo, c, p, m) => {
    expect(dimensionarSistema(c, p, m)).toBeNull();
  });

  it("contraste: dimensionarSistema com entradas finitas e positivas (1200, 120, 620) não devolve null (17 módulos)", () => {
    const r = dimensionarSistema(1200, 120, 620);
    expect(r).not.toBeNull();
    expect(r?.quantidadeModulos).toBe(17);
  });

  it("varredura densa ao redor de TODOS os limites 74,4 x k (k = 1..40): digitado === persistido e confere com oráculo inteiro", () => {
    // Consumos em milésimos inteiros (n / 1000 é o decimal exato de 3 casas): evita artefato de ponto flutuante em 74,4 x k.
    // Oráculo independente, só com inteiros: centésimos persistidos = floor((n + 5) / 10) (half up, n > 0);
    // um módulo cobre 120 x 0,62 = 74,4 kWh = 7440 centésimos, então módulos = max(1, ceil(centésimos / 7440)) e 0 centésimo = null.
    const deltas = [-10, -6, -5, -4, -1, 0, 1, 3, 4, 5, 6, 9, 10];
    const problemas: string[] = [];
    let verificados = 0;
    for (let k = 1; k <= 40; k++) {
      const limiteMilesimos = 74400 * k; // L = 74,4 x k
      for (const d of deltas) {
        const n = limiteMilesimos + d;
        const x = n / 1000;
        const centesimos = Math.floor((n + 5) / 10);
        const esperado = centesimos === 0 ? null : Math.max(1, Math.ceil(centesimos / 7440));
        const direto = modulos(x);
        const viaPersistido = modulos(consumoComoPersistido(x));
        verificados++;
        if (direto !== viaPersistido || direto !== esperado) {
          problemas.push(`k=${k} x=${x}: direto=${direto} persistido=${viaPersistido} esperado=${esperado}`);
        }
      }
    }
    expect(verificados).toBe(40 * deltas.length);
    expect({ total: problemas.length, amostra: problemas.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
  });

  it("a linha gravada a partir de 1190,404 grava 1190,40 e a potência normalizada do kit de 17 módulos", () => {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, potenciaKwp: 17 * 0.62, consumoMedioKwh: 1190.404, tarifaKwh: 0.9 }, PARAMETROS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linha.consumo_medio_kwh).toBe(1190.4);
    expect(r.linha.kit_potencia_kwp).toBe(10.54);
  });
});
