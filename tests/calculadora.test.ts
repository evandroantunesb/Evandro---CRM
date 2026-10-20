/** Calculadora solar (modo comercial): geração, desconto de disponibilidade e Fio B, payback. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calcular,
  custosInternosEstimados,
  dimensionarSistema,
  POTENCIA_MODULO_REFERENCIA_W,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";

describe("Fio B: percentual do ano sobre a parte Fio B da tarifa", () => {
  const base = {
    potenciaKwp: 5,
    precoKit: 20000,
    tipoLigacao: "trifasico" as const,
    consumoMedioKwh: 400,
    tarifaKwh: 0.9,
    produtividadeKwhKwpMes: 120,
    percentualFioB: 0.6,
    disponibilidadeKwh: 100,
  };

  it("o percentual incide só sobre a parte Fio B da tarifa (30% da tarifa x 60% do ano)", () => {
    const r = calcular({ ...base, parteFioBTarifa: 0.3 });
    // 300 kWh compensados x R$ 0,90 x 0,3 x 0,6
    expect(r.custoFioB).toBe(48.6);
    expect(r.contaComSolar).toBe(138.6);
    expect(r.economiaMensal).toBe(221.4);
    expect(r.paybackMeses).toBe(90.3);
  });

  it("parte 100% reproduz o cálculo antigo (percentual sobre a tarifa inteira)", () => {
    expect(calcular({ ...base, parteFioBTarifa: 1 }).custoFioB).toBe(162);
  });

  it("o custo do Fio B é proporcional à parte informada e a economia só sobe quando ela diminui", () => {
    const economia = [1, 0.5, 0.25].map((parteFioBTarifa) => calcular({ ...base, parteFioBTarifa }).economiaMensal);
    expect(economia[0]).toBeLessThan(economia[1]);
    expect(economia[1]).toBeLessThan(economia[2]);
    expect(calcular({ ...base, parteFioBTarifa: 0.5 }).custoFioB).toBe(81);
  });
});

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
      parteFioBTarifa: 1,
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
      parteFioBTarifa: 1,
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
      parteFioBTarifa: 1,
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
      parteFioBTarifa: 1,
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

describe("sugerirQuantidadeModulos", () => {
  it("arredonda pra cima a quantidade que cobre 100% do consumo", () => {
    // Precisa de 500/120 = 4,1667 kWp; com módulo de 550W, 4166,67/550 = 7,58 → 8.
    expect(sugerirQuantidadeModulos(500, 120, 550)).toBe(8);
  });

  it("sugere no mínimo 1 módulo quando o consumo é baixo", () => {
    expect(sugerirQuantidadeModulos(10, 120, 550)).toBe(1);
  });

  it("retorna null com consumo, produtividade ou potência inválidos", () => {
    expect(sugerirQuantidadeModulos(0, 120, 550)).toBeNull();
    expect(sugerirQuantidadeModulos(500, 0, 550)).toBeNull();
    expect(sugerirQuantidadeModulos(500, 120, 0)).toBeNull();
  });
});

describe("custosInternosEstimados", () => {
  it("soma instalação por módulo, material CA por kWp e engenharia, com comissão sobre o subtotal", () => {
    // instalação: 8 × 150 = 1200; material CA: 4,4 × 300 = 1320; engenharia: 500
    // subtotal: 10000 (componentes) + 1200 + 1320 + 500 = 13020; comissão 5% = 651
    const r = custosInternosEstimados(10000, 8, 4.4, {
      custoInstalacaoPorModulo: 150,
      custoMaterialCaPorKwp: 300,
      custoEngenharia: 500,
      comissaoPercentual: 0.05,
    });
    expect(r.custoInstalacao).toBe(1200);
    expect(r.custoMaterialCa).toBe(1320);
    expect(r.custoEngenharia).toBe(500);
    expect(r.comissao).toBe(651);
    expect(r.total).toBe(13671);
  });

  it("zero em tudo quando os parâmetros não estão configurados", () => {
    const r = custosInternosEstimados(10000, 8, 4.4, {
      custoInstalacaoPorModulo: 0,
      custoMaterialCaPorKwp: 0,
      custoEngenharia: 0,
      comissaoPercentual: 0,
    });
    expect(r.total).toBe(10000);
  });
});

describe("dimensionarSistema (fonte única do assistente e do kit)", () => {
  it("cobre 100% do consumo com a produtividade configurada, sem fator oculto", () => {
    // 1.200 kWh / 120 kWh/kWp/mês = 10 kWp. O assistente antigo multiplicava por 1,24 (12,4 kWp).
    const d = dimensionarSistema(1200, 120, 500)!;
    expect(d.potenciaNecessariaKwp).toBe(10);
    expect(d.quantidadeModulos).toBe(20);
    expect(d.potenciaInstaladaKwp).toBe(10);
  });

  it("arredonda os módulos para cima e informa a potência instalada", () => {
    const d = dimensionarSistema(450, 120, 550)!;
    expect(d.potenciaNecessariaKwp).toBe(3.75);
    expect(d.quantidadeModulos).toBe(7); // 3.750 W / 550 W = 6,82
    expect(d.potenciaInstaladaKwp).toBe(3.85);
  });

  it("não sobe um módulo por erro de ponto flutuante", () => {
    // 1.200 / 120 * 1000 / 500 pode dar 20,000000000000004 sem o arredondamento interno.
    expect(dimensionarSistema(0.1 * 12000, 120, 500)!.quantidadeModulos).toBe(20);
    expect(dimensionarSistema(3600, 120, 600)!.quantidadeModulos).toBe(50);
  });

  it("consumo pequeno ainda pede ao menos um módulo", () => {
    expect(dimensionarSistema(10, 120, 620)!.quantidadeModulos).toBe(1);
  });

  it("entrada inválida não dimensiona", () => {
    expect(dimensionarSistema(0, 120, 620)).toBeNull();
    expect(dimensionarSistema(450, 0, 620)).toBeNull();
    expect(dimensionarSistema(450, 120, 0)).toBeNull();
    expect(dimensionarSistema(Number.NaN, 120, 620)).toBeNull();
    expect(dimensionarSistema(-1, 120, 620)).toBeNull();
  });

  it("o kit personalizado (sugerirQuantidadeModulos) e o assistente dão a mesma quantidade", () => {
    for (const consumo of [150, 450, 1200, 3333]) {
      for (const produtividade of [100, 120, 135]) {
        for (const w of [550, POTENCIA_MODULO_REFERENCIA_W, 700]) {
          expect(sugerirQuantidadeModulos(consumo, produtividade, w)).toBe(dimensionarSistema(consumo, produtividade, w)!.quantidadeModulos);
        }
      }
    }
  });

  it("o assistente de novo negócio usa a função única, sem conta própria nem fator escondido", () => {
    const fonte = readFileSync("src/app/(app)/negocios/novo/formulario.tsx", "utf8");
    expect(fonte).toContain("dimensionarSistema(");
    expect(fonte).not.toMatch(/\*\s*1[.,]24\b/);
    expect(fonte).not.toContain("estimarSistemaMock");
  });
});
