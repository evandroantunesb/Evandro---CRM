/**
 * Calculadora solar (modo comercial): motor (incompleta sem dados regulatórios; regra aceita com eles), aritmética de
 * arredondamento aprovada (`fecharEconomia`), dimensionamento e kit. Dados fictícios.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calcular,
  custosInternosEstimados,
  dimensionarSistema,
  fecharEconomia,
  POTENCIA_MODULO_REFERENCIA_W,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
  type EntradaCalculo,
  type ResultadoCalculo,
  type ResultadoCalculoIncompleto,
} from "@/lib/calculadora";
import type { ContextoEstimativa, TarifaGd } from "@/lib/tarifa-gd";

function incompleto(r: ResultadoCalculo): ResultadoCalculoIncompleto {
  if (r.estado !== "incompleta") throw new Error("o motor deveria devolver a estimativa incompleta");
  return r;
}

const BASE: EntradaCalculo = {
  potenciaKwp: 5,
  precoKit: 20000,
  tipoLigacao: "trifasico",
  consumoMedioKwh: 400,
  tarifaKwh: 0.9,
  produtividadeKwhKwpMes: 120,
  percentualFioB: 0.6,
  disponibilidadeKwh: 100,
};

const COPEL: TarifaGd = {
  id: "t1",
  distribuidora: "COPEL-DIS",
  nomesAceitos: ["copel"],
  ato: "REH 3.592/2026",
  subgrupo: "B1",
  subclasse: "residencial",
  modalidade: "convencional",
  baseTributaria: "sem_tributos",
  teRsMwh: 310.85,
  tusdRsMwh: 457.17,
  fioBRsMwh: 214.535600374,
  vigenciaInicio: "2026-06-24",
  vigenciaFim: "2027-06-23",
  pendenciasFonte: [],
};

const CONTEXTO: ContextoEstimativa = { dataReferencia: "2026-10-22", tipoCliente: "residencial", distribuidoraInformada: "Copel", tarifas: [COPEL] };

const COMPLETA: EntradaCalculo = { ...BASE, dadosEstimativa: { contexto: CONTEXTO, tarifaBaseTributaria: "sem_tributos" } };

describe("calcular (motor): sem os dados regulatórios, estimativa incompleta", () => {
  it("sem contexto: só potência, geração e pendências (nenhum número financeiro)", () => {
    const r = incompleto(calcular(BASE));
    expect(r.pendencias.map((p) => p.codigo)).toEqual(expect.arrayContaining(["enquadramento_ausente", "distribuidora_ausente", "base_tributaria_ausente"]));
    expect(Object.keys(r).sort()).toEqual(["estado", "geracaoEstimadaKwhMes", "pendencias", "potenciaKwp"]);
    for (const campo of ["kwhFaturado", "kwhCompensado", "custoFioB", "contaSemSolar", "contaComSolar", "economiaMensal", "paybackMeses"]) {
      expect(r).not.toHaveProperty(campo);
    }
  });

  it("a geração (potência × produtividade, 2 casas) continua disponível", () => {
    expect(incompleto(calcular(BASE)).geracaoEstimadaKwhMes).toBe(600);
    expect(incompleto(calcular({ ...BASE, potenciaKwp: 3 })).geracaoEstimadaKwhMes).toBe(360);
    // 3,33 × 121,7 = 405,261 => 405,26
    const r = incompleto(calcular({ ...BASE, potenciaKwp: 3.33, produtividadeKwhKwpMes: 121.7 }));
    expect(r.geracaoEstimadaKwhMes).toBe(405.26);
    expect(r.potenciaKwp).toBe(3.33);
  });

  it("consumo ou tarifa ausentes acrescentam a pendência do vendedor, nunca um número", () => {
    const semConsumo = incompleto(calcular({ ...COMPLETA, consumoMedioKwh: 0 }));
    expect(semConsumo.pendencias.map((p) => p.codigo)).toEqual(["consumo_ausente"]);
    const semTarifa = incompleto(calcular({ ...COMPLETA, tarifaKwh: 0 }));
    expect(semTarifa.pendencias.map((p) => p.codigo)).toEqual(["tarifa_base_ausente"]);
  });

  it("é determinístico e não altera a entrada", () => {
    const entrada = structuredClone(COMPLETA);
    const copia = structuredClone(entrada);
    expect(calcular(entrada)).toEqual(calcular(entrada));
    expect(entrada).toEqual(copia);
  });
});

describe("calcular (motor): com os dados regulatórios, regra aceita", () => {
  it("completa com contas, economia e payback nulo; percentual e disponibilidade da empresa não têm efeito", () => {
    const r = calcular(COMPLETA);
    expect(r.estado).toBe("completa");
    if (r.estado !== "completa") return;
    // Trifásico D = 100; C = 400; G = 600; T = 0,9: K = min(600, 400, 300 × 0,9 / (0,9 − N)) = 350,07 (conta com solar no piso: 100 × 0,9 = 90)
    expect(r).toMatchObject({ contaSemSolar: 360, contaComSolar: 90, economiaMensal: 270, kwhCompensado: 350.07, kwhFaturado: 49.93, paybackMeses: null });
    expect(calcular({ ...COMPLETA, percentualFioB: 0.99, disponibilidadeKwh: 7 })).toEqual(r);
    expect(calcular({ ...COMPLETA, precoKit: 1 })).toEqual(r);
  });

  it("o tipo de ligação muda o piso (art. 291)", () => {
    const pequeno = { ...COMPLETA, consumoMedioKwh: 20 };
    const conta = (l: EntradaCalculo["tipoLigacao"]) => {
      const r = calcular({ ...pequeno, tipoLigacao: l });
      return r.estado === "completa" ? r.contaComSolar : null;
    };
    expect([conta("monofasico"), conta("bifasico"), conta("trifasico")]).toEqual([27, 45, 90]);
  });
});

describe("fecharEconomia (arredondamento aprovado: economia = diferença das contas arredondadas)", () => {
  it("contas inteiras: economia = sem − com e payback = preço ÷ economia (1 casa)", () => {
    // 360 − 252 = 108; 20000 ÷ 108 = 185,185… => 185,2
    expect(fecharEconomia(360, 252, 20000)).toEqual({ contaSemSolar: 360, contaComSolar: 252, economiaMensal: 108, paybackMeses: 185.2 });
  });

  it("arredonda cada conta a 2 casas ANTES de subtrair", () => {
    // 100,004 => 100,00 e 50,004 => 50,00; economia 50; payback 1000 ÷ 50 = 20
    expect(fecharEconomia(100.004, 50.004, 1000)).toEqual({ contaSemSolar: 100, contaComSolar: 50, economiaMensal: 50, paybackMeses: 20 });
  });

  it("contas que aparecem iguais (diferença real de R$ 0,008) => economia 0 e payback null", () => {
    // 20,004 => 20,00 e 19,996 => 20,00. Sem a regra, a economia seria 0,01 e o payback absurdo.
    const r = fecharEconomia(20.004, 19.996, 20000);
    expect(r.contaSemSolar).toBe(20);
    expect(r.contaComSolar).toBe(20);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackMeses).toBeNull();
  });

  it("contas exibidas diferem 1 centavo (diferença real minúscula) => economia 0,01 e payback sobre a economia arredondada", () => {
    // 1,0051 => 1,01 e 1,0049 => 1,00; economia exibida 0,01; payback 10 ÷ 0,01 = 1000
    const r = fecharEconomia(1.0051, 1.0049, 10);
    expect(r.contaSemSolar).toBe(1.01);
    expect(r.contaComSolar).toBe(1);
    expect(r.economiaMensal).toBe(0.01);
    expect(r.paybackMeses).toBe(1000);
  });

  it("economia exatamente zero => payback null", () => {
    expect(fecharEconomia(30, 30, 5000)).toEqual({ contaSemSolar: 30, contaComSolar: 30, economiaMensal: 0, paybackMeses: null });
  });

  it("economia negativa (com solar mais cara) => payback null, sem inventar valor", () => {
    const r = fecharEconomia(50, 60, 5000);
    expect(r.economiaMensal).toBe(-10);
    expect(r.paybackMeses).toBeNull();
  });

  it("os números exibidos sempre fecham e payback é null exatamente quando a economia é <= 0 (varredura)", () => {
    const contas = [0, 0.004, 0.006,1.0049, 1.0051, 19.996, 20.004, 29.99, 30, 100.004, 252, 360.0049];
    for (const sem of contas) {
      for (const com of contas) {
        const r = fecharEconomia(sem, com, 12345.67);
        expect(r.economiaMensal).toBeCloseTo(r.contaSemSolar - r.contaComSolar, 10);
        expect(Math.abs(r.economiaMensal * 100 - Math.round(r.economiaMensal * 100))).toBeLessThan(1e-6);
        expect(r.paybackMeses === null).toBe(r.economiaMensal <= 0);
        if (r.paybackMeses !== null) expect(r.paybackMeses).toBe(Math.round((12345.67 / r.economiaMensal) * 10) / 10);
      }
    }
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
