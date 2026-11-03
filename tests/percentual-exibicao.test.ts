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
