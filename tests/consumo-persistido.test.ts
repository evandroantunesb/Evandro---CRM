/**
 * M2-Q2 (D3): `valorComoPersistido` e `consumoComoPersistido` (src/lib/consumo-persistido.ts).
 * Regra: escala da coluna numeric(p, s) do Postgres, half away from zero sobre o valor DECIMAL do número
 * (o texto mais curto do double, que é o que é enviado ao banco). Cada esperado abaixo é derivado dessa regra
 * escrita à mão, não do código.
 */
import { describe, expect, it } from "vitest";
import { consumoComoPersistido, valorComoPersistido } from "@/lib/consumo-persistido";

describe("valorComoPersistido: casas 0", () => {
  it.each([
    [2.5, 3], // metade afasta de zero (Math.round e banker's dariam 3 e 2)
    [3.5, 4],
    [0.5, 1],
    [1.4, 1],
    [1.49, 1],
    [1.5, 2],
    [0, 0],
    [7, 7],
    [-2.5, -3], // simétrico
    [-0.5, -1],
    [-1.4, -1],
  ])("%s -> %s", (entrada, esperado) => {
    expect(valorComoPersistido(entrada, 0)).toBe(esperado);
  });
});

describe("valorComoPersistido: casas 2", () => {
  it.each([
    [1.005, 1.01], // 1.005 * 100 = 100.49999999999999 em ponto flutuante; o decimal é 1,005
    [1.004, 1],
    [2.675, 2.68],
    [0.005, 0.01],
    [0.004, 0],
    [0.0049, 0],
    [1190.405, 1190.41],
    [1190.404, 1190.4],
    [1190.396, 1190.4],
    [20000.005, 20000.01],
    [19999.995, 20000],
    [99999999.99, 99999999.99],
    [1200, 1200],
    [1.1, 1.1],
  ])("%s -> %s", (entrada, esperado) => {
    expect(valorComoPersistido(entrada, 2)).toBe(esperado);
  });
});

describe("valorComoPersistido: casas 4", () => {
  it.each([
    [0.12345, 0.1235],
    [0.123456, 0.1235],
    [0.95231, 0.9523],
    [0.00005, 0.0001],
    [0.00004, 0],
    [1.23455, 1.2346],
    [1.23454, 1.2345],
    [0.9, 0.9],
    [0.9999, 0.9999],
  ])("%s -> %s", (entrada, esperado) => {
    expect(valorComoPersistido(entrada, 4)).toBe(esperado);
  });
});

describe("valorComoPersistido: negativos, zero, idempotência e não finitos", () => {
  it.each([
    [1.005, 2],
    [2.675, 2],
    [0.00005, 4],
    [1.23455, 4],
    [2.5, 0],
    [1190.405, 2],
    [123.456789, 2],
  ])("negativo é simétrico: -(%s) com %s casas", (v, casas) => {
    expect(valorComoPersistido(-v, casas)).toBe(-valorComoPersistido(v, casas));
  });

  it.each([
    [-0.004, 2],
    [-0.4, 0],
    [-0.00004, 4],
    [-1e-7, 2],
  ])("nunca devolve -0: %s com %s casas", (v, casas) => {
    expect(Object.is(valorComoPersistido(v, casas), -0)).toBe(false);
    expect(valorComoPersistido(v, casas)).toBe(0);
  });

  // Achado resolvido (M2-Q2): a entrada -0 devolvia -0; contrato D3 "nunca -0" vale agora também para ela.
  it.each([
    [-0, 2],
    [-0, 0],
  ])("entrada -0 devolve 0, não -0: %s com %s casas", (v, casas) => {
    expect(Object.is(valorComoPersistido(v, casas), -0)).toBe(false);
  });

  it("é idempotente (casas 0, 2 e 4)", () => {
    for (const casas of [0, 2, 4]) {
      for (const v of [1.005, 2.675, 0.005, 0.00005, 1.23455, 1190.405, 0.1 + 0.2, 123.456789, 2.5, -2.5, -1.005, 0.004, 1e-7, 99999999.99]) {
        const uma = valorComoPersistido(v, casas);
        expect(valorComoPersistido(uma, casas), `${v} com ${casas} casas`).toBe(uma);
      }
    }
  });

  it("NaN e ±Infinity são devolvidos como vieram", () => {
    expect(valorComoPersistido(Number.NaN, 2)).toBeNaN();
    expect(valorComoPersistido(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
    expect(valorComoPersistido(Number.NEGATIVE_INFINITY, 4)).toBe(Number.NEGATIVE_INFINITY);
    expect(valorComoPersistido(Number.NaN, 0)).toBeNaN();
  });

  it("notação científica abaixo de 1e-6 vira 0 (casas 2 e 4)", () => {
    expect(valorComoPersistido(1e-7, 2)).toBe(0);
    expect(valorComoPersistido(1e-7, 4)).toBe(0);
    expect(valorComoPersistido(4e-9, 2)).toBe(0);
    expect(valorComoPersistido(Number.MIN_VALUE, 2)).toBe(0);
  });

  it("inteiros grandes (notação científica acima de 1e21) não têm casas fracionárias e ficam inalterados", () => {
    expect(valorComoPersistido(1e21, 2)).toBe(1e21);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -0.5])("casas inválidas (%s) lançam RangeError", (casas) => {
    expect(() => valorComoPersistido(1.234, casas)).toThrow(RangeError);
  });
});

describe("consumoComoPersistido = valorComoPersistido com 2 casas", () => {
  it.each([
    [1200.555, 1200.56],
    [1200.554, 1200.55],
    [1.005, 1.01],
    [0.005, 0.01],
    [0.004, 0],
    [1111.111111, 1111.11],
    [1190.404, 1190.4],
    [1190.405, 1190.41],
    [-1.005, -1.01],
    [1200, 1200],
  ])("%s -> %s", (entrada, esperado) => {
    expect(consumoComoPersistido(entrada)).toBe(esperado);
    expect(consumoComoPersistido(entrada)).toBe(valorComoPersistido(entrada, 2));
  });

  it("não finitos são devolvidos", () => {
    expect(consumoComoPersistido(Number.NaN)).toBeNaN();
    expect(consumoComoPersistido(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});
