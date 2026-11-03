/**
 * Calculadora solar (modo comercial): motor (estimativa SEMPRE incompleta, sem fórmula validada), aritmética de
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

const CODIGOS_SEM_DADOS_DA_EMPRESA = [
  "enquadramento_ausente",
  "distribuidora_ausente",
  "fio_b_ausente",
  "base_tributaria_divergente",
  "formula_nao_validada",
];

describe("calcular (motor: estimativa sempre incompleta)", () => {
  it("com consumo e tarifa do vendedor continua incompleta, só com as pendências da empresa", () => {
    const r = incompleto(calcular(BASE));
    expect(r.pendencias.map((p) => p.codigo)).toEqual(CODIGOS_SEM_DADOS_DA_EMPRESA);
  });

  it("devolve só potência, geração e pendências: nenhum número financeiro", () => {
    const r = incompleto(calcular(BASE));
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

  it("kit de 0 kWp: geração 0 e nenhuma economia nem payback", () => {
    const r = incompleto(calcular({ ...BASE, potenciaKwp: 0, precoKit: 0 }));
    expect(r.geracaoEstimadaKwhMes).toBe(0);
    expect(r).not.toHaveProperty("economiaMensal");
    expect(r).not.toHaveProperty("paybackMeses");
  });

  it("percentual do Fio B, disponibilidade, preço e tipo de ligação não alteram o resultado (sem efeito)", () => {
    const ref = calcular(BASE);
    expect(calcular({ ...BASE, percentualFioB: 0.99, disponibilidadeKwh: 7 })).toEqual(ref);
    expect(calcular({ ...BASE, percentualFioB: undefined, disponibilidadeKwh: undefined })).toEqual(ref);
    expect(calcular({ ...BASE, precoKit: 1 })).toEqual(ref);
    expect(calcular({ ...BASE, tipoLigacao: "monofasico" })).toEqual(ref);
  });

  it("consumo ou tarifa ausentes acrescentam a pendência do vendedor, nunca um número", () => {
    const semConsumo = incompleto(calcular({ ...BASE, consumoMedioKwh: 0 }));
    expect(semConsumo.pendencias.map((p) => p.codigo)).toEqual([
      "enquadramento_ausente",
      "distribuidora_ausente",
      "consumo_ausente",
      "fio_b_ausente",
      "base_tributaria_divergente",
      "formula_nao_validada",
    ]);
    const semTarifa = incompleto(calcular({ ...BASE, tarifaKwh: 0 }));
    expect(semTarifa.pendencias.map((p) => p.codigo)).toContain("tarifa_base_ausente");
    expect(semTarifa.pendencias.map((p) => p.codigo)).not.toContain("consumo_ausente");
  });

  it("mesmo com TODOS os dados da estimativa presentes continua incompleta (fórmula não validada)", () => {
    const r = incompleto(
      calcular({
        ...BASE,
        dadosEstimativa: {
          enquadramento: { classe: "B1", modalidade: "convencional", gd: "GD_II", anoReferencia: 2026 },
          tarifaBaseBaseTributaria: "com_tributos",
          dataReferencia: "2026-06-15",
          parametrosFioB: {
            fioBRsKwh: 0.111, // FICTÍCIO
            baseTributaria: "com_tributos",
            origem: "manual_justificado",
            distribuidora: "Distribuidora FICTÍCIA",
            fonte: "Fonte fictícia de teste",
            vigenciaInicio: "2026-01-01",
            vigenciaFim: "2026-12-31",
            justificativa: "Justificativa fictícia de teste",
          },
        },
      }),
    );
    expect(r.pendencias.map((p) => p.codigo)).toEqual(["formula_nao_validada"]);
    expect(r.geracaoEstimadaKwhMes).toBe(600);
  });

  it("é determinístico e não altera a entrada", () => {
    const entrada = { ...BASE };
    const copia = structuredClone(entrada);
    expect(calcular(entrada)).toEqual(calcular(entrada));
    expect(entrada).toEqual(copia);
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
