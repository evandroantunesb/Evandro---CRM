/**
 * Método v2 do cálculo (proposta completa, PR 2b-1; premissas aprovadas pelo Evandro em 24/11/2026): tributos da
 * empresa, autoconsumo do negócio e projeção de 25 anos com payback, sobre o caso de referência da Copel (16/11/2026).
 */
import { describe, expect, it } from "vitest";
import { calcular, METODO_GD2_PISO_V2, type EntradaCalculo, type ResultadoCalculoCompleto } from "@/lib/calculadora";
import { linhaDeCalculo, recalcularDaLinha } from "@/lib/calculo-reproduzivel";
import { MARGENS_ZERADAS } from "@/lib/compras/margens";
import { precoInversorDoKit, type ItemPrecificacao } from "@/lib/compras/precificacao-kit";
import { comTributos, PREMISSAS_PROJECAO, projetarEconomia } from "@/lib/projecao-financeira";
import type { ContextoEstimativa, TarifaGd } from "@/lib/tarifa-gd";

const COPEL: TarifaGd = {
  id: "ref-copel",
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
const CONTEXTO: ContextoEstimativa = { dataReferencia: "2026-11-24", tipoCliente: "residencial", distribuidoraInformada: "Copel", tarifas: [COPEL] };
const T = 0.76802;
const FINANCEIRO = { icms: 0.19, pisCofins: 0.0763, autoconsumoFracao: 0.3, precoInversor: 4000 };

const ENTRADA: EntradaCalculo = {
  potenciaKwp: 6.1,
  precoKit: 24500,
  tipoLigacao: "monofasico",
  consumoMedioKwh: 650,
  tarifaKwh: T,
  produtividadeKwhKwpMes: 120,
  dadosEstimativa: { contexto: CONTEXTO, tarifaBaseTributaria: "sem_tributos" },
  financeiro: FINANCEIRO,
};

function completo(e: Partial<EntradaCalculo> = {}): ResultadoCalculoCompleto {
  const r = calcular({ ...ENTRADA, ...e });
  if (r.estado !== "completa") throw new Error(`esperava completa: ${JSON.stringify(r)}`);
  return r;
}

describe("calcular: método v2", () => {
  it("usa a projeção aprovada: 1º mês com tributos, autoconsumo e a perda do 1º ano; payback e 25 anos", () => {
    const r = completo();
    const p = projetarEconomia({
      consumoMensalKwh: 650,
      geracaoMensalKwh: 6.1 * 120,
      autoconsumoFracao: 0.3,
      tarifaSemTributosRsKwh: T,
      fioBSemTributosRsKwh: COPEL.fioBRsMwh / 1000,
      icms: 0.19,
      pisCofins: 0.0763,
      custoDisponibilidadeKwh: 30,
      mesInicio: "2026-11",
      investimento: 24500,
      precoInversor: 4000,
    });
    if (!p.ok) throw new Error(p.motivo);
    expect(r.retrato.metodo).toBe(METODO_GD2_PISO_V2);
    expect(r.economiaMensal).toBe(p.primeiroMes.economia);
    expect(r.contaSemSolar).toBe(p.primeiroMes.contaSemSolar);
    expect(r.contaSemSolar).toBeCloseTo(650 * comTributos(T, 0.19, 0.0763), 2);
    expect(r.paybackMeses).toBe(p.paybackMeses);
    expect(r.financeiro).toMatchObject({
      icms: 0.19,
      pisCofins: 0.0763,
      autoconsumoFracao: 0.3,
      precoInversor: 4000,
      economiaPrimeiroAno: p.economiaPrimeiroAno,
      economia25Anos: p.economiaTotal,
      saldo25Anos: p.saldoFinal,
      paybackMotivo: null,
    });
    expect(r.financeiro!.projecao.anos).toHaveLength(25);
    // A geração mostrada continua a nominal (potência × produtividade); a conta usa a do 1º ano (99%).
    expect(r.geracaoEstimadaKwhMes).toBe(732);
    expect(r.retrato.autoconsumoKwh).toBeCloseTo(732 * 0.99 * 0.3, 2);
  });

  it("declara as premissas do v2 nas ressalvas, sem as do v1", () => {
    const { ressalvas } = completo().retrato;
    expect(ressalvas).toEqual(expect.arrayContaining(["autoconsumo_informado", "tributos_empresa", "projecao_premissas"]));
    expect(ressalvas).not.toContain("sem_tributos");
    expect(ressalvas).not.toContain("autoconsumo_zero");
    expect(ressalvas).not.toContain("payback_indisponivel");
  });

  it("com impostos e autoconsumo, a economia é maior que a do v1 (sem tributos e sem autoconsumo)", () => {
    const v1 = completo({ financeiro: undefined });
    expect(v1.retrato.metodo).toBe("gd2_piso_655i_v1");
    expect(v1.financeiro).toBeNull();
    expect(v1.paybackMeses).toBeNull();
    expect(completo().economiaMensal).toBeGreaterThan(v1.economiaMensal);
  });

  it("sem o preço do inversor: economia sim, payback não, com o motivo e a ressalva", () => {
    const r = completo({ financeiro: { ...FINANCEIRO, precoInversor: null } });
    expect(r.paybackMeses).toBeNull();
    expect(r.financeiro).toMatchObject({ precoInversor: null, saldo25Anos: null, paybackMotivo: "inversor_sem_preco" });
    expect(r.retrato.ressalvas).toContain("payback_sem_preco_inversor");
    expect(r.financeiro!.economia25Anos).toBe(completo().financeiro!.economia25Anos);
  });

  it("sem o valor do negócio: economia sim, payback não, motivo sem investimento", () => {
    const r = completo({ precoKit: 0 });
    expect(r.paybackMeses).toBeNull();
    expect(r.financeiro).toMatchObject({ saldo25Anos: null, paybackMotivo: "sem_investimento" });
    expect(r.retrato.ressalvas).toContain("payback_sem_investimento");
  });

  it("mais autoconsumo, mais economia", () => {
    expect(completo({ financeiro: { ...FINANCEIRO, autoconsumoFracao: 0.5 } }).economiaMensal).toBeGreaterThan(completo().economiaMensal);
  });
});

describe("linhaDeCalculo: colunas do v2 e coerência com o banco", () => {
  const PARAMETROS = { produtividade_kwh_kwp_mes: 120, percentual_fio_b: 0.45, disponibilidade_mono_kwh: 30, disponibilidade_bi_kwh: 50, disponibilidade_tri_kwh: 100 };
  const entrada = {
    kitNome: "Kit 6,1 kWp",
    potenciaKwp: 6.1,
    precoKit: 24500,
    tipoLigacao: "monofasico" as const,
    consumoMedioKwh: 650,
    valorFaturaMedio: null,
    tarifaKwh: T,
    tarifaBaseTributaria: "sem_tributos" as const,
  };
  const linha = (extra: { autoconsumoFracao?: number | null; precoInversor?: number | null; precoKit?: number } = {}, tributos = { icms: 0.19, pis_cofins: 0.0763 }) => {
    const r = linhaDeCalculo("empresa", { ...entrada, ...extra }, { ...PARAMETROS, ...tributos }, CONTEXTO);
    if (!r.ok) throw new Error(r.mensagem);
    return r.linha;
  };

  /** A mesma regra do check `calculos_solares_estado_coerente_ck` para o v2 (migration 20261221100000). */
  const coerenteNoBanco = (l: ReturnType<typeof linha>) =>
    l.icms != null &&
    l.pis_cofins != null &&
    l.autoconsumo_fracao != null &&
    l.economia_primeiro_ano != null &&
    l.economia_25_anos != null &&
    l.projecao != null &&
    (l.payback_meses == null) === (l.payback_motivo != null) &&
    (l.saldo_25_anos == null) === (l.payback_motivo != null && l.payback_motivo !== "nao_se_paga_no_horizonte") &&
    (l.payback_motivo !== "inversor_sem_preco" || l.preco_inversor == null) &&
    (l.preco_inversor != null || l.payback_motivo === "sem_investimento" || l.payback_motivo === "inversor_sem_preco");

  it("com os tributos da empresa grava o v2; autoconsumo nulo vira o padrão residencial", () => {
    const l = linha({ precoInversor: 4000 });
    expect(l.metodo_calculo).toBe(METODO_GD2_PISO_V2);
    expect(l.estado_financeiro).toBe("completo");
    expect(l.autoconsumo_fracao).toBe(PREMISSAS_PROJECAO.autoconsumoResidencial);
    expect(l.payback_meses).toBeGreaterThan(0);
    expect(coerenteNoBanco(l)).toBe(true);
  });

  it("todos os casos sem payback respeitam a regra do banco", () => {
    for (const extra of [{ precoInversor: null }, { precoKit: 0, precoInversor: 4000 }, { precoKit: 0, precoInversor: null }, { precoKit: 10_000_000, precoInversor: 4000 }]) {
      expect(coerenteNoBanco(linha(extra)), JSON.stringify(extra)).toBe(true);
    }
  });

  it("sem os tributos nos parâmetros, continua o v1 (colunas do v2 nulas, payback nulo)", () => {
    const r = linhaDeCalculo("empresa", entrada, PARAMETROS, CONTEXTO);
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.linha.metodo_calculo).toBe("gd2_piso_655i_v1");
    expect([r.linha.icms, r.linha.projecao, r.linha.payback_meses]).toEqual([null, null, null]);
  });

  it("a linha v2 gravada se reproduz pelo retrato (1º mês, em centavos)", () => {
    const l = linha({ precoInversor: 4000 });
    const r = recalcularDaLinha({
      kit_potencia_kwp: Number(l.kit_potencia_kwp),
      produtividade_kwh_kwp_mes: Number(l.produtividade_kwh_kwp_mes),
      consumo_medio_kwh: Number(l.consumo_medio_kwh),
      tarifa_kwh: Number(l.tarifa_kwh),
      disponibilidade_kwh: Number(l.disponibilidade_kwh),
      fio_b_rs_mwh: l.fio_b_rs_mwh ?? null,
      percentual_legal_fio_b: l.percentual_legal_fio_b ?? null,
      autoconsumo_kwh: l.autoconsumo_kwh ?? null,
      icms: l.icms ?? null,
      pis_cofins: l.pis_cofins ?? null,
    });
    expect(r).not.toBeNull();
    expect(Math.abs(r!.economiaMensal - Number(l.economia_mensal))).toBeLessThanOrEqual(0.02);
  });
});

describe("preço do inversor do kit (troca no ano 12)", () => {
  const item = (o: Partial<ItemPrecificacao>): ItemPrecificacao => ({ tipo: "inversor", descricao: "Inversor", quantidade: 1, potenciaW: null, materialId: null, precoVendaManual: null, ...o });
  const custos = new Map([["mat-inv", { categoria: "inversores" as const, custo: 3000, fornecedor: "F", dataPreco: "2026-11-01" }]]);
  const margens = { ...MARGENS_ZERADAS, inversores: 0.25 };

  it("pela tabela: melhor custo × (1 + margem) × quantidade", () => {
    expect(precoInversorDoKit({ itens: [item({ materialId: "mat-inv", quantidade: 2 })], custos, margens })).toBe(7500);
  });

  it("pelo preço à mão do item", () => {
    expect(precoInversorDoKit({ itens: [item({ precoVendaManual: 4200 })], custos, margens })).toBe(4200);
  });

  it("os módulos não entram; sem inversor ou com inversor sem preço, nulo", () => {
    const modulo: ItemPrecificacao = { tipo: "modulo", descricao: "Módulo", quantidade: 10, potenciaW: 610, materialId: null, precoVendaManual: 700 };
    expect(precoInversorDoKit({ itens: [modulo, item({ precoVendaManual: 4200 })], custos, margens })).toBe(4200);
    expect(precoInversorDoKit({ itens: [modulo], custos, margens })).toBeNull();
    expect(precoInversorDoKit({ itens: [item({}), item({ precoVendaManual: 4200 })], custos, margens })).toBeNull();
  });
});
