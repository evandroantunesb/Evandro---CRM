/** Dimensionamento automático do kit (fase 1): escolhe módulo+inversor ativos, calcula overload e valida string. */
import { describe, expect, it } from "vitest";
import {
  avaliarCombinacaoEscolhida,
  dimensionarSistemaAutomatico,
  paraEquipamentoAtivo,
  type EquipamentoAtivo,
} from "@/lib/dimensionamento";

const TEMPERATURA_PADRAO_C = 5;

const modulo620: EquipamentoAtivo = { id: "m1", fabricante: "Fab", modelo: "620W", potenciaW: 620, prioridade: 0 };
const inversor65: EquipamentoAtivo = { id: "i1", fabricante: "Fab", modelo: "6,5kW", potenciaW: 6500, prioridade: 0 };
const inversor6: EquipamentoAtivo = { id: "i2", fabricante: "Fab", modelo: "6kW", potenciaW: 6000, prioridade: 0 };
const inversor8: EquipamentoAtivo = { id: "i3", fabricante: "Fab", modelo: "8kW", potenciaW: 8000, prioridade: 0 };

describe("dimensionarSistemaAutomatico", () => {
  it("recomenda o exemplo da especificação: 13 módulos de 620W + inversor 6,5kW, ~24% de overload", () => {
    const [opcao] = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620],
      inversores: [inversor65],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    // potência alvo = 780*1,2/120 = 7,8 kWp -> 13 módulos de 620W = 8,06 kWp
    expect(opcao.quantidadeModulos).toBe(13);
    expect(opcao.potenciaDcKwp).toBe(8.06);
    expect(opcao.overloadPct).toBeCloseTo(0.24, 2);
    expect(opcao.validacao).toBe("valido");
  });

  it("marca overload acima do limite automático como 'valido_com_alerta', não bloqueia", () => {
    // 8,06 kWp / 6 kW = 34,3% de overload, acima do limite de 30% (seção 156 da spec).
    const [opcao] = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620],
      inversores: [inversor6],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcao.overloadPct).toBeCloseTo(0.343, 2);
    expect(opcao.validacao).toBe("valido_com_alerta");
  });

  it("prioriza opções válidas sobre opções com alerta, mesmo com prioridade comercial menor", () => {
    const opcoes = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620],
      inversores: [inversor6, inversor65],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcoes[0].inversor.id).toBe("i1");
    expect(opcoes[0].validacao).toBe("valido");
  });

  it("entre válidas, prioriza prioridade comercial do equipamento", () => {
    const inversor65Prioritario: EquipamentoAtivo = { ...inversor65, id: "i1b", prioridade: 10 };
    const opcoes = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620],
      inversores: [inversor8, inversor65Prioritario],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcoes[0].inversor.id).toBe("i1b");
  });

  it("retorna até 3 opções, no máximo 1 por módulo", () => {
    const modulo585: EquipamentoAtivo = {
      id: "m2",
      fabricante: "Fab",
      modelo: "585W",
      potenciaW: 585,
      prioridade: 0,
    };
    const opcoes = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620, modulo585],
      inversores: [inversor6, inversor65, inversor8],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcoes.length).toBe(2);
    expect(new Set(opcoes.map((o) => o.modulo.id)).size).toBe(2);
  });

  it("retorna vazio sem módulos ou inversores ativos", () => {
    expect(
      dimensionarSistemaAutomatico({
        consumoMedioKwh: 780,
        margemPct: 0.2,
        produtividadeKwhKwpMes: 120,
        modulos: [],
        inversores: [inversor65],
        overloadMaximoPct: 0.3,
        temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
      }),
    ).toEqual([]);
  });

  it("marca como 'não verificado' quando falta dado elétrico no catálogo", () => {
    const [opcao] = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [modulo620],
      inversores: [inversor65],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcao.validacaoEletrica).toBe("nao_verificado");
    expect(opcao.stringConfig).toBeNull();
  });

  it("valida a string (Voc frio + faixa de MPPT) quando o catálogo tem os dados elétricos", () => {
    // Módulo com Voc 41,5V, coef -0,26%/°C, Vmp 34,8V; inversor com DC máx 600V, MPPT 80-550V.
    const moduloCompleto: EquipamentoAtivo = {
      ...modulo620,
      vocV: 41.5,
      iscA: 18.5,
      vmpV: 34.8,
      impA: 17.8,
      coefTempVocPctC: -0.26,
    };
    const inversorCompleto: EquipamentoAtivo = {
      ...inversor65,
      tensaoMaxDcV: 600,
      mpptMinV: 80,
      mpptMaxV: 550,
      correnteMaxEntradaA: 40,
      quantidadeMppt: 2,
    };
    const [opcao] = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [moduloCompleto],
      inversores: [inversorCompleto],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcao.validacaoEletrica).toBe("valido");
    expect(opcao.stringConfig).not.toBeNull();
    expect(opcao.stringConfig!.vocFrioV).toBeLessThanOrEqual(600);
    expect(opcao.stringConfig!.vmpStringV).toBeGreaterThanOrEqual(80);
    expect(opcao.stringConfig!.vmpStringV).toBeLessThanOrEqual(550);
  });

  it("descarta a combinação quando nenhum arranjo de string cabe na faixa de MPPT do inversor", () => {
    // Vmp de 34,8V por módulo nunca cai numa faixa de MPPT de 500-550V com poucos módulos,
    // e o Voc no frio (limite de 250V) estoura antes de a string chegar perto dessa faixa.
    const moduloCompleto: EquipamentoAtivo = {
      ...modulo620,
      vocV: 41.5,
      iscA: 18.5,
      vmpV: 34.8,
      impA: 17.8,
      coefTempVocPctC: -0.26,
    };
    const inversorIncompativel: EquipamentoAtivo = {
      ...inversor65,
      tensaoMaxDcV: 250,
      mpptMinV: 500,
      mpptMaxV: 550,
    };
    const opcoes = dimensionarSistemaAutomatico({
      consumoMedioKwh: 780,
      margemPct: 0.2,
      produtividadeKwhKwpMes: 120,
      modulos: [moduloCompleto],
      inversores: [inversorIncompativel],
      overloadMaximoPct: 0.3,
      temperaturaMinimaProjetoC: TEMPERATURA_PADRAO_C,
    });
    expect(opcoes).toEqual([]);
  });
});

describe("avaliarCombinacaoEscolhida", () => {
  it("com a mesma quantidade que o motor automático teria escolhido, dá o mesmo resultado", () => {
    // Mesmo exemplo da spec: 13 módulos de 620W + inversor 6,5kW -> 8,06 kWp, ~24% de overload.
    const opcao = avaliarCombinacaoEscolhida(modulo620, inversor65, 13, 0.3, TEMPERATURA_PADRAO_C);
    expect(opcao?.quantidadeModulos).toBe(13);
    expect(opcao?.potenciaDcKwp).toBe(8.06);
    expect(opcao?.overloadPct).toBeCloseTo(0.24, 2);
    expect(opcao?.validacao).toBe("valido");
  });

  it("valida uma quantidade escolhida manualmente pelo vendedor, diferente da sugestão automática", () => {
    // 5 módulos de 620W = 3,1 kWp; overload negativo (sistema bem abaixo do inversor), ainda válido.
    const opcao = avaliarCombinacaoEscolhida(modulo620, inversor65, 5, 0.3, TEMPERATURA_PADRAO_C);
    expect(opcao?.quantidadeModulos).toBe(5);
    expect(opcao?.potenciaDcKwp).toBe(3.1);
    expect(opcao?.validacao).toBe("valido");
  });

  it("marca overload acima do limite como 'valido_com_alerta', sem bloquear", () => {
    // 13 módulos de 620W (8,06 kWp) num inversor de 6 kW -> ~34,3% de overload, acima do limite de 30%.
    const opcao = avaliarCombinacaoEscolhida(modulo620, inversor6, 13, 0.3, TEMPERATURA_PADRAO_C);
    expect(opcao?.overloadPct).toBeCloseTo(0.343, 2);
    expect(opcao?.validacao).toBe("valido_com_alerta");
  });

  it("rejeita quantidade zero ou negativa", () => {
    expect(avaliarCombinacaoEscolhida(modulo620, inversor65, 0, 0.3, TEMPERATURA_PADRAO_C)).toBeNull();
    expect(avaliarCombinacaoEscolhida(modulo620, inversor65, -1, 0.3, TEMPERATURA_PADRAO_C)).toBeNull();
  });

  it("rejeita a combinação quando a quantidade escolhida não forma nenhuma string eletricamente compatível", () => {
    const moduloCompleto: EquipamentoAtivo = {
      ...modulo620,
      vocV: 41.5,
      iscA: 18.5,
      vmpV: 34.8,
      impA: 17.8,
      coefTempVocPctC: -0.26,
    };
    const inversorIncompativel: EquipamentoAtivo = { ...inversor65, tensaoMaxDcV: 250, mpptMinV: 500, mpptMaxV: 550 };
    expect(avaliarCombinacaoEscolhida(moduloCompleto, inversorIncompativel, 13, 0.3, TEMPERATURA_PADRAO_C)).toBeNull();
  });

  it("valida a string (Voc frio + faixa de MPPT) com a quantidade escolhida, quando o catálogo tem dados elétricos", () => {
    const moduloCompleto: EquipamentoAtivo = {
      ...modulo620,
      vocV: 41.5,
      iscA: 18.5,
      vmpV: 34.8,
      impA: 17.8,
      coefTempVocPctC: -0.26,
    };
    const inversorCompleto: EquipamentoAtivo = {
      ...inversor65,
      tensaoMaxDcV: 600,
      mpptMinV: 80,
      mpptMaxV: 550,
      correnteMaxEntradaA: 40,
      quantidadeMppt: 2,
    };
    const opcao = avaliarCombinacaoEscolhida(moduloCompleto, inversorCompleto, 13, 0.3, TEMPERATURA_PADRAO_C);
    expect(opcao?.validacaoEletrica).toBe("valido");
    expect(opcao?.stringConfig).not.toBeNull();
  });
});

describe("paraEquipamentoAtivo", () => {
  it("converte um registro de equipamentos_empresa (snake_case) para EquipamentoAtivo (camelCase)", () => {
    const equipamento = paraEquipamentoAtivo({
      id: "e1",
      fabricante: "Canadian",
      modelo: "CS7L-620",
      potencia_w: 620,
      prioridade: 5,
      voc_v: 41.5,
      isc_a: 18.5,
      vmp_v: 34.8,
      imp_a: 17.8,
      coef_temp_voc_pct_c: -0.26,
      tensao_max_dc_v: 600,
      mppt_min_v: 80,
      mppt_max_v: 550,
      corrente_max_entrada_a: 40,
      quantidade_mppt: 2,
    });
    expect(equipamento).toEqual({
      id: "e1",
      fabricante: "Canadian",
      modelo: "CS7L-620",
      potenciaW: 620,
      prioridade: 5,
      vocV: 41.5,
      iscA: 18.5,
      vmpV: 34.8,
      impA: 17.8,
      coefTempVocPctC: -0.26,
      tensaoMaxDcV: 600,
      mpptMinV: 80,
      mpptMaxV: 550,
      correnteMaxEntradaA: 40,
      quantidadeMppt: 2,
    });
  });
});
