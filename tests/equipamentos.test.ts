/** Campos técnicos por tipo de equipamento (módulo vs. inversor) — bug relatado pelo Evandro em 2026-09-30. */
import { describe, expect, it } from "vitest";
import { camposTecnicosParaPersistir, type CamposTecnicosEntrada } from "@/lib/equipamentos";

/** Todos os campos preenchidos (módulo e inversor ao mesmo tempo) — simula o pior caso: o
 * formulário enviou (ou o parser aceitou) valores de ambos os tipos numa só submissão. */
const TUDO_PREENCHIDO: CamposTecnicosEntrada = {
  vocV: 41.5,
  iscA: 18.5,
  vmpV: 34.8,
  impA: 17.8,
  coefTempVocPctC: -0.26,
  tipoInversor: "hibrido",
  tensaoMaxDcV: 600,
  tensaoPartidaV: 120,
  mpptMinV: 80,
  mpptMaxV: 550,
  quantidadeMppt: 2,
  entradasPorMppt: 2,
  correnteMaxEntradaA: 20,
  iscMaximoEntradaA: 22,
  potenciaDcMaximaEntradaW: 8000,
  tensaoAcV: 220,
  fasesCa: "trifasico",
  correnteMaxAcA: 25,
  eficienciaPct: 0.975,
};

describe("camposTecnicosParaPersistir", () => {
  it("novo módulo → só campos de módulo", () => {
    const campos = camposTecnicosParaPersistir("modulo", TUDO_PREENCHIDO);
    expect(campos).toEqual({
      voc_v: 41.5,
      isc_a: 18.5,
      vmp_v: 34.8,
      imp_a: 17.8,
      coef_temp_voc_pct_c: -0.26,
    });
  });

  it("novo inversor → só campos de inversor", () => {
    const campos = camposTecnicosParaPersistir("inversor", TUDO_PREENCHIDO);
    expect(campos).toEqual({
      tipo_inversor: "hibrido",
      tensao_max_dc_v: 600,
      tensao_partida_v: 120,
      mppt_min_v: 80,
      mppt_max_v: 550,
      quantidade_mppt: 2,
      entradas_por_mppt: 2,
      corrente_max_entrada_a: 20,
      isc_maximo_entrada_a: 22,
      potencia_dc_maxima_entrada_w: 8000,
      tensao_ac_v: 220,
      fases_ca: "trifasico",
      corrente_max_ac_a: 25,
      eficiencia_pct: 0.975,
    });
  });

  it("trocar de módulo pra inversor não reaproveita os campos elétricos de módulo", () => {
    const campos = camposTecnicosParaPersistir("inversor", TUDO_PREENCHIDO);
    expect(campos).not.toHaveProperty("voc_v");
    expect(campos).not.toHaveProperty("isc_a");
    expect(campos).not.toHaveProperty("vmp_v");
    expect(campos).not.toHaveProperty("imp_a");
    expect(campos).not.toHaveProperty("coef_temp_voc_pct_c");
  });

  it("trocar de inversor pra módulo não reaproveita os campos técnicos de inversor", () => {
    const campos = camposTecnicosParaPersistir("modulo", TUDO_PREENCHIDO);
    expect(campos).not.toHaveProperty("tipo_inversor");
    expect(campos).not.toHaveProperty("tensao_max_dc_v");
    expect(campos).not.toHaveProperty("mppt_min_v");
    expect(campos).not.toHaveProperty("mppt_max_v");
    expect(campos).not.toHaveProperty("quantidade_mppt");
    expect(campos).not.toHaveProperty("entradas_por_mppt");
    expect(campos).not.toHaveProperty("corrente_max_entrada_a");
    expect(campos).not.toHaveProperty("isc_maximo_entrada_a");
    expect(campos).not.toHaveProperty("potencia_dc_maxima_entrada_w");
    expect(campos).not.toHaveProperty("tensao_ac_v");
    expect(campos).not.toHaveProperty("fases_ca");
    expect(campos).not.toHaveProperty("corrente_max_ac_a");
    expect(campos).not.toHaveProperty("eficiencia_pct");
  });

  it("campos técnicos não informados viram null (equipamento fica 'não verificado')", () => {
    const vazio: CamposTecnicosEntrada = {
      vocV: null,
      iscA: null,
      vmpV: null,
      impA: null,
      coefTempVocPctC: null,
      tipoInversor: null,
      tensaoMaxDcV: null,
      tensaoPartidaV: null,
      mpptMinV: null,
      mpptMaxV: null,
      quantidadeMppt: null,
      entradasPorMppt: null,
      correnteMaxEntradaA: null,
      iscMaximoEntradaA: null,
      potenciaDcMaximaEntradaW: null,
      tensaoAcV: null,
      fasesCa: null,
      correnteMaxAcA: null,
      eficienciaPct: null,
    };
    expect(camposTecnicosParaPersistir("modulo", vazio)).toEqual({
      voc_v: null,
      isc_a: null,
      vmp_v: null,
      imp_a: null,
      coef_temp_voc_pct_c: null,
    });
    expect(camposTecnicosParaPersistir("inversor", vazio)).toEqual({
      tipo_inversor: null,
      tensao_max_dc_v: null,
      tensao_partida_v: null,
      mppt_min_v: null,
      mppt_max_v: null,
      quantidade_mppt: null,
      entradas_por_mppt: null,
      corrente_max_entrada_a: null,
      isc_maximo_entrada_a: null,
      potencia_dc_maxima_entrada_w: null,
      tensao_ac_v: null,
      fases_ca: null,
      corrente_max_ac_a: null,
      eficiencia_pct: null,
    });
  });
});
