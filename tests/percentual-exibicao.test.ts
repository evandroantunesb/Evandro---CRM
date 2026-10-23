/**
 * M2-Q1 (A): fração gravada (0,57) -> texto do campo em porcentagem ("57"), sem resíduo de ponto flutuante,
 * e a ida e volta "salvar e reabrir sem alterar" (servidor: lerNumeroBr(texto)/100; banco arredonda à escala).
 */
import { describe, expect, it } from "vitest";
import { lerNumeroBr } from "@/lib/formatacao";
import { percentualParaCampo } from "@/lib/percentual-exibicao";

const FORMATO_CAMPO = /^\d{1,3}(,\d{1,6})?$/;

describe("percentualParaCampo: valores de referência", () => {
  it.each([
    [0.57, "57"],
    [0.575, "57,5"],
    [0.29, "29"],
    [0.07, "7"],
    [0, "0"],
    [1, "100"],
    [0.0005, "0,05"],
    [0.1234, "12,34"],
  ])("%s -> %s", (fracao, esperado) => {
    expect(percentualParaCampo(fracao)).toBe(esperado);
  });

  it("caso-bug: 0,57 e 0,29 não exibem resíduo de ponto flutuante", () => {
    // 0.57 * 100 === 56.99999999999999 e 0.29 * 100 === 28.999999999999996 em ponto flutuante.
    expect(percentualParaCampo(0.57)).not.toBe("56,99999999999999");
    expect(percentualParaCampo(0.29)).not.toBe("28,999999999999996");
    expect(percentualParaCampo(0.57)).toBe("57");
    expect(percentualParaCampo(0.29)).toBe("29");
  });

  it("não usa ponto, separador de milhar nem notação científica", () => {
    for (const f of [0, 0.000001, 0.0005, 0.57, 0.575, 1]) {
      const texto = percentualParaCampo(f);
      expect(texto).not.toMatch(/[.eE]/);
    }
  });

  it("preserva até 6 casas legítimas na porcentagem", () => {
    expect(percentualParaCampo(0.00000123)).toBe("0,000123");
    expect(percentualParaCampo(0.123456 / 100)).toBe("0,123456");
  });
});

describe("percentualParaCampo: zero, menores valores não nulos e limites", () => {
  it("zero exibe '0' (sem '0,0' nem '-0')", () => {
    expect(percentualParaCampo(0)).toBe("0");
    expect(percentualParaCampo(-0)).toBe("0");
  });

  it("menor Fio B não nulo (numeric(4,3): 0,001) e menor comissão não nula (numeric(5,4): 0,0001)", () => {
    expect(percentualParaCampo(0.001)).toBe("0,1");
    expect(percentualParaCampo(0.0001)).toBe("0,01");
  });

  it("limites: 0 e 1 (check do banco entre 0 e 1) exibem '0' e '100'", () => {
    expect(percentualParaCampo(0)).toBe("0");
    expect(percentualParaCampo(1)).toBe("100");
  });

  it("não finitos viram texto vazio (nunca 'NaN' nem 'Infinity' no campo)", () => {
    expect(percentualParaCampo(Number.NaN)).toBe("");
    expect(percentualParaCampo(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("formulário -> banco -> campo: textos que o formulário aceita (lerNumeroBr(texto)/100)", () => {
  // O banco arredonda à escala da coluna (Fio B numeric(4,3); comissão numeric(5,4)). Esse arredondamento é do
  // Postgres, não do helper: o helper só formata o que foi gravado. O valor gravado de verdade para os textos que
  // excedem a escala é conferido contra o banco real em tests/calculadora-persistencia-db.test.ts.
  it.each([
    ["57,5", "57,5"],
    ["57", "57"],
    ["0", "0"],
    ["100", "100"],
    ["0,1", "0,1"],
    ["0,10", "0,1"],
    ["29", "29"],
  ])("Fio B: texto %s -> fração -> campo %s (sem resíduo)", (texto, esperado) => {
    const fracao = (lerNumeroBr(texto) ?? 0) / 100;
    expect(percentualParaCampo(fracao)).toBe(esperado);
  });

  it("campo vazio vale 0% e exibe '0'", () => {
    expect(percentualParaCampo((lerNumeroBr("") ?? 0) / 100)).toBe("0");
  });

  it("texto com ponto é recusado pelo leitor (formulário não aceita '57.5')", () => {
    expect(lerNumeroBr("57.5")).toBeNaN();
  });

  it("texto da escala Fio B é estável depois do primeiro salvamento (idempotência do texto)", () => {
    // Fio B: até 1 casa na porcentagem; comissão: até 2 casas. Aqui só os textos já na escala.
    for (const texto of ["0", "0,1", "0,5", "12,3", "45", "57,5", "99,9", "100"]) {
      const f = (lerNumeroBr(texto) ?? 0) / 100;
      const exibido = percentualParaCampo(f);
      expect(exibido).toBe(texto);
      expect(percentualParaCampo((lerNumeroBr(exibido) ?? 0) / 100)).toBe(exibido);
    }
    for (const texto of ["0,01", "0,05", "12,34", "57,5", "99,99"]) {
      const f = (lerNumeroBr(texto) ?? 0) / 100;
      const exibido = percentualParaCampo(f);
      expect(exibido).toBe(texto);
      expect(percentualParaCampo((lerNumeroBr(exibido) ?? 0) / 100)).toBe(exibido);
    }
  });
});

describe.each([
  ["Fio B numeric(4,3)", 1000],
  ["comissão numeric(5,4)", 10000],
])("varredura completa: %s", (_nome, escala) => {
  it("todo k/escala gera texto no formato do campo", () => {
    const fora: string[] = [];
    for (let k = 0; k <= escala; k++) {
      const texto = percentualParaCampo(k / escala);
      if (!FORMATO_CAMPO.test(texto)) fora.push(`${k}/${escala} -> "${texto}"`);
    }
    expect({ total: fora.length, amostra: fora.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
  });

  it("salvar e reabrir sem alterar devolve o mesmo valor gravado (aritmética inteira)", () => {
    const divergentes: string[] = [];
    for (let k = 0; k <= escala; k++) {
      const texto = percentualParaCampo(k / escala);
      const lido = lerNumeroBr(texto);
      // O servidor grava lerNumeroBr(texto)/100 e o banco arredonda à escala da coluna.
      const gravado = lido === null ? Number.NaN : Math.round((lido / 100) * escala);
      if (gravado !== k) divergentes.push(`${k}/${escala} -> "${texto}" -> ${gravado}`);
    }
    expect({ total: divergentes.length, amostra: divergentes.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
  });

  it("o texto não perde casas: percentual lido bate com k*100/escala (inteiros)", () => {
    const divergentes: string[] = [];
    for (let k = 0; k <= escala; k++) {
      const texto = percentualParaCampo(k / escala);
      // Em centésimos de ponto percentual (escala 10000 -> inteiro exato; escala 1000 -> múltiplo de 10).
      const centesimos = Math.round((lerNumeroBr(texto) ?? Number.NaN) * 100);
      const esperado = (k * 10000) / escala;
      if (centesimos !== esperado) divergentes.push(`${k}/${escala} -> "${texto}"`);
    }
    expect({ total: divergentes.length, amostra: divergentes.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
  });
});
