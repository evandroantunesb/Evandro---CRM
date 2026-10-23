import { describe, expect, it } from "vitest";
import { paybackComPreco, precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { fecharEconomia } from "@/lib/calculadora";

describe("precoDoCalculoDesatualizado", () => {
  it("igual não é desatualizado, diferente é", () => {
    expect(precoDoCalculoDesatualizado(25000, 25000)).toBe(false);
    expect(precoDoCalculoDesatualizado(25000, 28000)).toBe(true);
    expect(precoDoCalculoDesatualizado(25000, 24999.99)).toBe(true);
  });
  it("compara em centavos (sem falso alerta por ponto flutuante)", () => {
    expect(precoDoCalculoDesatualizado(0.3, 0.1 + 0.2)).toBe(false);
  });
  it("negócio sem valor conta como zero, como no cálculo", () => {
    expect(precoDoCalculoDesatualizado(0, null)).toBe(false);
    expect(precoDoCalculoDesatualizado(25000, null)).toBe(true);
  });
});

describe("paybackComPreco", () => {
  it("é preço ÷ economia, 1 casa", () => {
    expect(paybackComPreco(28000, 1500)).toBe(18.7);
  });
  it("fica em aberto sem preço ou sem economia", () => {
    expect(paybackComPreco(0, 1500)).toBeNull();
    expect(paybackComPreco(28000, 0)).toBeNull();
    expect(paybackComPreco(28000, -10)).toBeNull();
  });
  it("bate exatamente com o payback da aritmética aprovada (fecharEconomia) com o preço novo", () => {
    // Contas fictícias (a fórmula das contas não está validada): só a aritmética de fechamento é exercida.
    const contas = [
      [412.37, 118.52],
      [360, 252],
      [100.004, 99.4],
    ];
    for (const [sem, com] of contas) {
      const antigo = fecharEconomia(sem, com, 25000);
      for (const preco of [28000, 19999.99, 41234.5]) {
        expect(paybackComPreco(preco, antigo.economiaMensal)).toBe(fecharEconomia(sem, com, preco).paybackMeses);
      }
    }
  });
  it("com economia zerada pelo arredondamento, o payback com preço novo também fica em aberto", () => {
    const r = fecharEconomia(20.004, 19.996, 25000);
    expect(r.economiaMensal).toBe(0);
    expect(paybackComPreco(28000, r.economiaMensal)).toBeNull();
    expect(fecharEconomia(20.004, 19.996, 28000).paybackMeses).toBeNull();
  });
});
