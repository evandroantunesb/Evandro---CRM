import { describe, expect, it } from "vitest";
import { valorPorExtenso } from "@/lib/extenso";

describe("valorPorExtenso", () => {
  it.each([
    [0, "zero real"],
    [1, "um real"],
    [0.01, "um centavo"],
    [0.5, "cinquenta centavos"],
    [2, "dois reais"],
    [100, "cem reais"],
    [101, "cento e um reais"],
    [1000, "mil reais"],
    [1001, "mil e um reais"],
    [1100, "mil e cem reais"],
    [1234, "mil, duzentos e trinta e quatro reais"],
    [42500, "quarenta e dois mil e quinhentos reais"],
    [2000.01, "dois mil reais e um centavo"],
    [1000000, "um milhão de reais"],
    [2500000, "dois milhões e quinhentos mil reais"],
    [1234567.89, "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos"],
  ])("%s → %s", (valor, esperado) => {
    expect(valorPorExtenso(valor)).toBe(esperado);
  });

  it("valor negativo ou não finito é recusado", () => {
    expect(() => valorPorExtenso(-1)).toThrow(RangeError);
    expect(() => valorPorExtenso(Number.NaN)).toThrow(RangeError);
  });
});
