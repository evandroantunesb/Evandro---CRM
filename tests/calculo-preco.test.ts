import { describe, expect, it } from "vitest";
import { paybackComPreco, precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { calcular } from "@/lib/calculadora";

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
  it("bate exatamente com o payback que a calculadora daria com o preço novo", () => {
    const base = { potenciaKwp: 6.6, tipoLigacao: "bifasico" as const, consumoMedioKwh: 700, tarifaKwh: 0.95, produtividadeKwhKwpMes: 120, percentualFioB: 0.45, disponibilidadeKwh: 50 };
    const antigo = calcular({ ...base, precoKit: 25000 });
    for (const preco of [28000, 19999.99, 41234.5]) {
      expect(paybackComPreco(preco, antigo.economiaMensal)).toBe(calcular({ ...base, precoKit: preco }).paybackMeses);
    }
  });
});
