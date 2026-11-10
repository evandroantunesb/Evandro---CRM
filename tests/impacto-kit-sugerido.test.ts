import { describe, expect, it } from "vitest";
import { analisarLinhas } from "@/lib/kit-linhas";
import { autonomia, carbonoEvitadoKgAno, FATOR_EMISSAO_SIN } from "@/lib/impacto";
import { inversorSugeridoKw, kitSimples, linhasKitSugerido, opcoesInversorKw, referenciaDoKit, relacaoCcCa } from "@/lib/kit-sugerido";

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
      { tipo: "modulo", descricao: "Módulo de referência 620 W", potenciaW: 620, quantidade: 9, materialId: null, precoVendaManual: null },
      { tipo: "inversor", descricao: "Inversor de referência 5 kW", potenciaW: 5000, quantidade: 1, materialId: null, precoVendaManual: null },
    ]);
  });
});

describe("kit sugerido pela tabela de preços (P4b)", () => {
  const material = (id: string, categoria: "modulos" | "inversores", potenciaW: number | null, temPreco = true) => ({
    id,
    nome: `${categoria} ${potenciaW}`,
    categoria,
    unidade: "un",
    potenciaW,
    temPreco,
    dataPreco: temPreco ? "2026-11-01" : null,
  });
  const materiais = [
    material("m550", "modulos", 550),
    material("m610", "modulos", 610),
    material("m700", "modulos", 700, false),
    material("m-sem", "modulos", null),
    material("i5", "inversores", 5000),
    material("i8", "inversores", 8000),
  ];

  it("módulo com preço e potência mais próxima da referência; inversores cadastrados por kW", () => {
    const ref = referenciaDoKit(materiais);
    expect(ref.modulo).toEqual({ materialId: "m610", descricao: "modulos 610", potenciaW: 610 });
    expect(ref.inversores.map((i) => [i.kw, i.materialId])).toEqual([
      [5, "i5"],
      [8, "i8"],
    ]);
    expect(inversorSugeridoKw(5.49, ref.inversores.map((i) => i.kw))).toBe(5);
    expect(opcoesInversorKw(5, [5, 8])).toEqual([5, 8]);
  });

  it("linhas levam o material; o kit sugerido é reconhecido; mexer em outro item tira do modo simples", () => {
    const ref = referenciaDoKit(materiais);
    const linhas = linhasKitSugerido(9, 8, ref);
    expect(linhas.map((l) => l.materialId)).toEqual(["m610", "i8"]);
    expect(kitSimples(linhas, ref)).toEqual({ quantidade: 9, inversorKw: 8 });
    expect(kitSimples([{ ...linhas[0], materialId: "m550" }], ref)).toBeNull();
    expect(kitSimples(linhasKitSugerido(9, 8), referenciaDoKit())).toEqual({ quantidade: 9, inversorKw: 8 });
  });

  it("sem materiais: os itens de referência de antes", () => {
    expect(referenciaDoKit([]).modulo.materialId).toBeNull();
    expect(referenciaDoKit([]).inversores[0]).toEqual({ kw: 3, materialId: null, descricao: "Inversor de referência 3 kW" });
  });
});
