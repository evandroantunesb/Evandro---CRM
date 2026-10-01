/** Mapeamento de linhas do CSV de importação em massa do catálogo (pedido do Evandro, 2026-10-01). */
import { describe, expect, it } from "vitest";
import { linhaCsvParaEquipamento } from "@/lib/equipamentos";

const LINHA_MODULO = {
  tipo: "modulo",
  fabricante: "Gokin Solar",
  modelo: "GK-4-66HT-620M",
  categoria: "modulo_fv",
  tecnologia: "N-Type TOPCon",
  bifacial: "false",
  bifacialidade_pct: "",
  potencia_wp: "620",
  voc_v: "48.96",
  vmp_v: "40.74",
  isc_a: "16.12",
  imp_a: "15.22",
  coef_temp_voc_pct_c: "-0.25",
  coef_temp_pmax_pct_c: "-0.29",
  coef_temp_isc_pct_c: "0.045",
  nmot_c: "",
  tensao_max_sistema_v: "1500",
  fusivel_max_serie_a: "30",
  eficiencia_modulo_pct: "23.0",
  comprimento_mm: "2382",
  largura_mm: "1134",
  espessura_mm: "30",
  peso_kg: "28.0",
  ativo: "true",
  prioridade: "1",
  custo_reais: "",
  status_validacao: "VALIDADO_DATASHEET",
  fonte_primaria: "https://exemplo.com/datasheet.pdf",
  fonte_secundaria: "",
  observacoes: "Dataset de teste.",
};

const LINHA_INVERSOR_TRIFASICO = {
  tipo: "inversor",
  fabricante: "Sungrow",
  modelo: "SG5.0RT",
  categoria: "on-grid",
  tecnologia: "string",
  potencia_ac_w: "5000",
  potencia_pv_recomendada_max_w: "7500",
  potencia_aparente_max_va: "5500",
  tensao_dc_max_v: "1100",
  tensao_partida_v: "180",
  mppt_min_v: "160",
  mppt_max_v: "1000",
  quantidade_mppt: "2",
  entradas_por_mppt: "1|1",
  corrente_max_por_mppt_a: "12.5|12.5",
  isc_max_por_mppt_a: "16|16",
  tensao_ac_v: "220/380|230/400|240/415",
  fases: "trifasico",
  corrente_ac_max_a: "8.3",
  eficiencia_inversor_pct: "98.4",
  grau_protecao: "IP65",
  ativo: "true",
  prioridade: "1",
  status_validacao: "VALIDADO_DATASHEET",
};

describe("linhaCsvParaEquipamento", () => {
  it("mapeia uma linha de módulo com todos os campos novos (dimensões, bifacial, procedência)", () => {
    const resultado = linhaCsvParaEquipamento(LINHA_MODULO);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valores).toMatchObject({
      tipo: "modulo",
      fabricante: "Gokin Solar",
      modelo: "GK-4-66HT-620M",
      potencia_w: 620,
      voc_v: 48.96,
      vmp_v: 40.74,
      isc_a: 16.12,
      imp_a: 15.22,
      coef_temp_voc_pct_c: -0.25,
      coef_temp_pmax_pct_c: -0.29,
      coef_temp_isc_pct_c: 0.045,
      bifacial: false,
      bifacialidade_pct: null,
      tensao_max_sistema_v: 1500,
      fusivel_max_serie_a: 30,
      eficiencia_modulo_pct: 0.23,
      comprimento_mm: 2382,
      largura_mm: 1134,
      espessura_mm: 30,
      peso_kg: 28,
      categoria: "modulo_fv",
      tecnologia: "N-Type TOPCon",
      status_validacao: "VALIDADO_DATASHEET",
      fonte_primaria: "https://exemplo.com/datasheet.pdf",
      observacoes: "Dataset de teste.",
      ativo: true,
      prioridade: 1,
      preco_referencia_brl: null,
    });
  });

  it("mapeia inversor trifásico com valores por MPPT separados por '|' — usa o primeiro grupo", () => {
    const resultado = linhaCsvParaEquipamento(LINHA_INVERSOR_TRIFASICO);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valores).toMatchObject({
      tipo: "inversor",
      potencia_w: 5000,
      tipo_inversor: "on_grid",
      tensao_max_dc_v: 1100,
      mppt_min_v: 160,
      mppt_max_v: 1000,
      quantidade_mppt: 2,
      entradas_por_mppt: 1,
      corrente_max_entrada_a: 12.5,
      isc_maximo_entrada_a: 16,
      tensao_ac_v: 220,
      tensao_fases_ac: "220/380|230/400|240/415",
      fases_ca: "trifasico",
      grau_protecao: "IP65",
      potencia_aparente_max_va: 5500,
    });
    expect(resultado.valores.eficiencia_pct).toBeCloseTo(0.984, 6);
  });

  it("rejeita tipo inválido", () => {
    const resultado = linhaCsvParaEquipamento({ ...LINHA_MODULO, tipo: "bateria" });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita linha sem fabricante", () => {
    const resultado = linhaCsvParaEquipamento({ ...LINHA_MODULO, fabricante: "" });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita módulo sem potência válida", () => {
    const resultado = linhaCsvParaEquipamento({ ...LINHA_MODULO, potencia_wp: "" });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita inversor sem potência AC válida", () => {
    const resultado = linhaCsvParaEquipamento({ ...LINHA_INVERSOR_TRIFASICO, potencia_ac_w: "0" });
    expect(resultado.ok).toBe(false);
  });
});
