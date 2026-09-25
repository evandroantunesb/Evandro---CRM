/** Calculadora solar (modo comercial): geração, desconto de disponibilidade e Fio B, payback. */
import { describe, expect, it } from "vitest";
import { calcular, potenciaKitPersonalizadoKwp } from "@/lib/calculadora";

describe("calcular", () => {
  it("desconta a disponibilidade mínima quando o kit cobre todo o consumo", () => {
    const r = calcular({
      potenciaKwp: 5,
      precoKit: 20000,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 400,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.6,
      disponibilidadeKwh: 100,
    });
    expect(r.geracaoEstimadaKwhMes).toBe(600);
    expect(r.kwhFaturado).toBe(100);
    expect(r.kwhCompensado).toBe(300);
    expect(r.custoFioB).toBe(162);
    expect(r.contaSemSolar).toBe(360);
    expect(r.contaComSolar).toBe(252);
    expect(r.economiaMensal).toBe(108);
    expect(r.paybackMeses).toBe(185.2);
  });

  it("cobra pelo consumo restante quando o kit só cobre parte do consumo", () => {
    const r = calcular({
      potenciaKwp: 3,
      precoKit: 15000,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 500,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.6,
      disponibilidadeKwh: 100,
    });
    expect(r.geracaoEstimadaKwhMes).toBe(360);
    expect(r.kwhFaturado).toBe(140);
    expect(r.kwhCompensado).toBe(360);
    expect(r.custoFioB).toBe(194.4);
    expect(r.economiaMensal).toBe(129.6);
    expect(r.paybackMeses).toBe(115.7);
  });

  it("não gera economia nem payback sem geração (kit de 0 kWp)", () => {
    const r = calcular({
      potenciaKwp: 0,
      precoKit: 0,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 400,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.6,
      disponibilidadeKwh: 100,
    });
    expect(r.geracaoEstimadaKwhMes).toBe(0);
    expect(r.kwhFaturado).toBe(400);
    expect(r.kwhCompensado).toBe(0);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackMeses).toBeNull();
  });

  it("nunca fatura mais kWh do que o consumo, mesmo com disponibilidade alta", () => {
    // Consumo bem baixo e disponibilidade trifásica (100 kWh) maior que o consumo.
    const r = calcular({
      potenciaKwp: 1,
      precoKit: 5000,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 50,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.6,
      disponibilidadeKwh: 100,
    });
    expect(r.kwhFaturado).toBe(50);
    expect(r.kwhCompensado).toBe(0);
    expect(r.economiaMensal).toBe(0);
  });
});

describe("potenciaKitPersonalizadoKwp", () => {
  it("soma só os módulos (potência × quantidade), ignorando inversor/bateria/outro", () => {
    const kwp = potenciaKitPersonalizadoKwp([
      { tipo: "modulo", potenciaW: 550, quantidade: 10 },
      { tipo: "modulo", potenciaW: 450, quantidade: 2 },
      { tipo: "inversor", potenciaW: 5000, quantidade: 1 },
      { tipo: "bateria", potenciaW: null, quantidade: 2 },
    ]);
    // (550*10 + 450*2) / 1000 = 6.4 kWp
    expect(kwp).toBe(6.4);
  });

  it("ignora módulos sem potência informada", () => {
    const kwp = potenciaKitPersonalizadoKwp([{ tipo: "modulo", potenciaW: null, quantidade: 10 }]);
    expect(kwp).toBe(0);
  });

  it("zero quando não há componentes", () => {
    expect(potenciaKitPersonalizadoKwp([])).toBe(0);
  });
});
