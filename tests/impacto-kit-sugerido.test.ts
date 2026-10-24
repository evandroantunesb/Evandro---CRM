import { describe, expect, it } from "vitest";
import { analisarLinhas } from "@/lib/kit-linhas";
import { autonomia, carbonoEvitadoKgAno, FATOR_EMISSAO_SIN } from "@/lib/impacto";
import { inversorSugeridoKw, linhasKitSugerido, opcoesInversorKw, relacaoCcCa } from "@/lib/kit-sugerido";

describe("impacto", () => {
  it("autonomia é geração ÷ consumo, limitada a 100%; sem dados, nada", () => {
    expect(autonomia(250, 500)).toBe(0.5);
    expect(autonomia(670, 500)).toBe(1);
    expect(autonomia(0, 500)).toBeNull();
    expect(autonomia(300, 0)).toBeNull();
    expect(autonomia(Number.NaN, 500)).toBeNull();
  });

  it("carbono evitado usa o fator oficial (kg/kWh = t/MWh) por ano", () => {
    expect(FATOR_EMISSAO_SIN).toMatchObject({ tco2PorMwh: 0.0385, ano: 2023 });
    expect(carbonoEvitadoKgAno(500)).toBe(Math.round(500 * 12 * 0.0385));
    expect(carbonoEvitadoKgAno(0)).toBeNull();
  });
});

describe("kit sugerido", () => {
  it("inversor: o menor comercial com relação módulos/inversor até 1,3", () => {
    expect(inversorSugeridoKw(4.34)).toBe(4);
    expect(inversorSugeridoKw(5.58)).toBe(5);
    expect(inversorSugeridoKw(10.54)).toBe(10);
    expect(inversorSugeridoKw(0)).toBeNull();
    expect(inversorSugeridoKw(1000)).toBeNull();
  });

  it("opções em volta da sugestão e relação informativa", () => {
    expect(opcoesInversorKw(5)).toEqual([4, 5, 6]);
    expect(opcoesInversorKw(3)).toEqual([3, 4]);
    expect(opcoesInversorKw(null)).toEqual([]);
    expect(relacaoCcCa(5.58, 5)).toBe(1.12);
  });

  it("as linhas do kit sugerido passam na mesma análise do editor (nada de formato próprio)", () => {
    const { componentes, problemas } = analisarLinhas(linhasKitSugerido(9, 5));
    expect(problemas).toEqual([]);
    expect(componentes).toEqual([
      { tipo: "modulo", descricao: "Módulo de referência 620 W", potenciaW: 620, quantidade: 9 },
      { tipo: "inversor", descricao: "Inversor de referência 5 kW", potenciaW: 5000, quantidade: 1 },
    ]);
  });
});
