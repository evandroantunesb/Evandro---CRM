/** Conversor único de números digitados no padrão brasileiro (M2-a) e a ida e volta com a reabertura do kit. */
import { describe, expect, it } from "vitest";
import { formatarMascaraMoeda, formatarNumeroBr, lerNumeroBr } from "@/lib/formatacao";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";

describe("máscara do valor do negócio", () => {
  it("interpreta dígitos como centavos e mantém o valor que o servidor lê", () => {
    expect(formatarMascaraMoeda("1000")).toBe("10,00");
    expect(lerNumeroBr(formatarMascaraMoeda("1000"))).toBe(10);
    expect(formatarMascaraMoeda("R$ 10.000,50")).toBe("10.000,50");
    expect(lerNumeroBr(formatarMascaraMoeda("R$ 10.000,50"))).toBe(10000.5);
  });
});

describe("lerNumeroBr", () => {
  it.each([
    ["1200", 1200],
    ["1.200", 1200],
    ["1.200,50", 1200.5],
    ["1200,50", 1200.5],
    ["0,95", 0.95],
    ["0,9512", 0.9512],
    ["12.345", 12345],
    ["12.345,6", 12345.6],
    ["1.234.567,89", 1234567.89],
    ["550", 550],
    ["  1.200,5  ", 1200.5],
    ["-1.200,5", -1200.5],
    ["0", 0],
  ])("%s → %d", (texto, esperado) => {
    expect(lerNumeroBr(texto)).toBe(esperado);
  });

  it("vazio, só espaços, null e undefined viram null (campo não preenchido)", () => {
    for (const v of ["", "   ", null, undefined]) expect(lerNumeroBr(v)).toBeNull();
  });

  it.each([
    // Ambíguos: ponto que não separa grupos de 3 dígitos (ponto decimal à moda americana).
    "1.2",
    "1.20",
    "1200.50",
    "0.95",
    "1.2345",
    "12.34,5",
    // Malformados.
    "1,2,3",
    "1.200.",
    ",5",
    "1,",
    "1 200",
    "R$ 10",
    "abc",
    "1e3",
    "--1",
    "1.200,5.0",
  ])("recusa %s (NaN, nunca outro valor)", (texto) => {
    expect(lerNumeroBr(texto)).toBeNaN();
  });
});

describe("formatarNumeroBr ↔ lerNumeroBr (reabrir e salvar sem editar)", () => {
  it.each([1200, 1200.5, 0.95, 0.9512, 12345, 12345.6, 1234567.89, 550, 5.5, 25000, 0.6, 99.7, 1, 0.0001])(
    "%d volta igual",
    (valor) => {
      expect(lerNumeroBr(formatarNumeroBr(valor))).toBe(valor);
    },
  );

  it("formata com milhar e vírgula", () => {
    expect(formatarNumeroBr(1200)).toBe("1.200");
    expect(formatarNumeroBr(1200.5)).toBe("1.200,5");
    expect(formatarNumeroBr(0.9512)).toBe("0,9512");
  });

  it("o estado reaberto do kit relido dá os mesmos números gravados (1200 kWh não vira 1,2)", () => {
    // Consumo e conta vêm do negócio; o cálculo só fornece a tarifa.
    const calculo = { tipoLigacao: "trifasico" as const, consumoMedioKwh: 700, valorFaturaMedio: 900, tarifaKwh: 0.9512 };
    const estado = estadoSalvoDoKit({
      componentesSalvos: [{ tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 10 }],
      calculo,
      estruturaTelhado: null,
      consumoMedioKwhPadrao: 1200,
      valorFaturaMedioPadrao: 1234.56,
    });
    expect(estado.consumoMedioKwh).toBe("1.200");
    expect(lerNumeroBr(estado.consumoMedioKwh)).toBe(1200);
    expect(lerNumeroBr(estado.valorFaturaMedio)).toBe(1234.56);
    // Antes a reabertura cortava em 2 casas e a tarifa salva de novo mudava (0,9512 → 0,95).
    expect(lerNumeroBr(estado.tarifaKwh)).toBe(0.9512);
    expect(lerNumeroBr(estado.linhas[0].potenciaW)).toBe(550);
  });
});
