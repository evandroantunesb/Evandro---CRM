/**
 * Oráculo do contrato aceito (.aurora/contratos/m2-p0-decisao-fio-b-copel.md, seção 7): os casos feitos à mão,
 * conferidos no módulo da fórmula E no motor real (`calcular` com o contexto da Copel), com precisão intermediária.
 *
 * Dados oficiais (ANEEL, Componentes Tarifárias 2026; REH 3.592/2026, COPEL-DIS, vigência 24/06/2026 a 23/06/2027;
 * B1 Convencional, Residencial, "Tarifa de Aplicação", sem tributos, R$/MWh; linha bruta em
 * .aurora/fontes/aneel-componentes-2026-copel-reh3592-b1.json; carga em supabase/migrations/20261023210000):
 *   TE 310,85 + TUSD 457,17 => T = 0,76802 R$/kWh
 *   TUSD_FioB 214,535600374 => N(2026, 60%) = 0,1287213602 R$/kWh; N(2027, 75%) = 0,1609017003 R$/kWh
 * Piso (REN 1.000, art. 291): monofásico 30, bifásico 50 (3 condutores, declarado), trifásico 100 kWh.
 */
import { describe, expect, it } from "vitest";
import { calcular, type ResultadoCalculo } from "@/lib/calculadora";
import { calcularFioBGd2 } from "@/lib/fio-b-gd2";
import { linhaDeCalculo } from "@/lib/calculo-reproduzivel";
import type { BaseTributaria, ContextoEstimativa, TarifaGd } from "@/lib/tarifa-gd";
import type { TipoLigacao } from "@/lib/tipos";

const T = (310.85 + 457.17) / 1000;
const N = (0.6 * 214.535600374) / 1000;
const D = 50;

const COPEL: TarifaGd = {
  id: "00000000-0000-0000-0000-00000000c0be",
  distribuidora: "COPEL-DIS",
  nomesAceitos: ["copel", "copel-dis", "copel dis", "copel distribuicao", "copel distribuicao s.a.", "copel distribuicao sa"],
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
  pendenciasFonte: ["tabela4_nao_conferida"],
};

const contexto = (o: Partial<ContextoEstimativa> = {}): ContextoEstimativa => ({
  dataReferencia: "2026-10-22",
  tipoCliente: "residencial",
  distribuidoraInformada: "Copel",
  tarifas: [COPEL],
  ...o,
});

/** Motor real: G = potência × produtividade; com produtividade 100, potência = G / 100. */
function motor(
  consumo: number,
  geracao: number,
  o: { ligacao?: TipoLigacao; tarifa?: number; base?: BaseTributaria | null; ctx?: Partial<ContextoEstimativa> } = {},
): ResultadoCalculo {
  return calcular({
    potenciaKwp: geracao / 100,
    precoKit: 20000,
    tipoLigacao: o.ligacao ?? "bifasico",
    consumoMedioKwh: consumo,
    tarifaKwh: o.tarifa ?? 0.76802,
    produtividadeKwhKwpMes: 100,
    dadosEstimativa: { contexto: contexto(o.ctx), tarifaBaseTributaria: o.base === undefined ? "sem_tributos" : o.base },
  });
}

function completa(r: ResultadoCalculo) {
  if (r.estado !== "completa") throw new Error(`esperava completa: ${JSON.stringify(r)}`);
  return r;
}

const codigos = (r: ResultadoCalculo) => (r.estado === "incompleta" ? r.pendencias.map((p) => p.codigo) : []);

const modulo = (consumoTotalKwh: number, geracaoTotalKwh: number) =>
  calcularFioBGd2({ consumoTotalKwh, geracaoTotalKwh, tarifaCheiaRsKwh: T, custoDisponibilidadeKwh: D, custoEnergiaCompensadaRsKwh: N });

// Caso: [consumo, geração, sem, com, economia, K, não compensado]
const CASOS: [string, number, number, number, number, number, number, number][] = [
  ["1. geração zero", 300, 0, 230.41, 230.41, 0, 0, 0],
  ["2. consumo abaixo do piso", 40, 200, 38.4, 38.4, 0, 0, 200],
  ["3. compensação parcial", 500, 300, 384.01, 192.22, 191.79, 300, 0],
  ["4. compensação total", 400, 500, 307.21, 51.49, 255.72, 400, 100],
  ["4b. piso limita", 200, 400, 153.6, 38.4, 115.2, 180.2, 219.8],
  ["5. C = 100, E = 100 (distingue as leituras)", 100, 100, 76.8, 38.4, 38.4, 60.07, 39.93],
];

describe("Copel B1 GD II 2026 (bifásico, D = 50): casos feitos à mão", () => {
  it.each(CASOS)("%s — módulo da fórmula", (_, c, g, sem, com, eco, k, nc) => {
    expect(modulo(c, g)).toMatchObject({
      ok: true,
      contaSemSolar: sem,
      contaComSolar: com,
      economiaMensal: eco,
      energiaCompensadaKwh: k,
      energiaDisponivelNaoCompensadaKwh: nc,
    });
  });

  it.each(CASOS)("%s — motor real (calcular + contexto Copel)", (_, c, g, sem, com, eco, k, nc) => {
    const r = completa(motor(c, g));
    expect(r).toMatchObject({ contaSemSolar: sem, contaComSolar: com, economiaMensal: eco, kwhCompensado: k, kwhNaoCompensado: nc, paybackMeses: null });
    expect(r.kwhFaturado).toBe(Math.round((c - k) * 100) / 100);
  });

  it("5: nunca 12,87 (a leitura literal, rejeitada pela ANEEL, compensaria os 100 kWh a N)", () => {
    expect(completa(motor(100, 100)).contaComSolar).not.toBe(12.87);
    expect(Math.round(100 * N * 100) / 100).toBe(12.87);
  });

  it("precisão intermediária: T com 5 casas e N sem arredondar (com T = 0,7680 ou N = 0,1287 o caso 3 mudaria)", () => {
    const r = completa(motor(500, 300));
    expect(r.contaSemSolar).toBe(384.01); // 500 × 0,7680 daria 384,00
    expect(r.contaComSolar).toBe(192.22); // 300 × 0,1287 daria 192,21
    expect(r.retrato.custoEnergiaCompensadaRsKwh).toBe(N); // sem arredondamento
    expect(r.custoFioB).toBe(38.62); // 300 × 0,1287213602 = 38,6164
  });

  it("linhaDeCalculo grava T com 5 casas e reproduz o caso 3", () => {
    const r = linhaDeCalculo(
      "empresa",
      { kitNome: "k", potenciaKwp: 3, precoKit: 20000, tipoLigacao: "bifasico", consumoMedioKwh: 500, valorFaturaMedio: null, tarifaKwh: 0.76802, tarifaBaseTributaria: "sem_tributos" },
      { produtividade_kwh_kwp_mes: 100, percentual_fio_b: 0.3, disponibilidade_mono_kwh: 30, disponibilidade_bi_kwh: 50, disponibilidade_tri_kwh: 100 },
      contexto(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linha).toMatchObject({
      estado_financeiro: "completo",
      metodo_calculo: "gd2_piso_655i_v1",
      tarifa_kwh: 0.76802,
      tarifa_origem: "oficial_aneel",
      tarifa_base_tributaria: "sem_tributos",
      fio_b_base_tributaria: "sem_tributos",
      fio_b_rs_mwh: 214.535600374,
      percentual_legal_fio_b: 0.6,
      disponibilidade_kwh: 50,
      conta_sem_solar: 384.01,
      conta_com_solar: 192.22,
      economia_mensal: 191.79,
      payback_meses: null,
      autoconsumo_kwh: 0,
      data_referencia: "2026-10-22",
      fio_b_vigencia_inicio: "2026-06-24",
      fio_b_vigencia_fim: "2027-06-23",
    });
  });
});

describe("piso pela ligação (art. 291): os 50 kWh não são valor fixo", () => {
  it("consumo 20 kWh (abaixo de todos os pisos): mono 30 × T, bi 50 × T, tri 100 × T", () => {
    expect(completa(motor(20, 100, { ligacao: "monofasico" })).contaComSolar).toBe(23.04);
    expect(completa(motor(20, 100, { ligacao: "bifasico" })).contaComSolar).toBe(38.4);
    expect(completa(motor(20, 100, { ligacao: "trifasico" })).contaComSolar).toBe(76.8);
    expect(completa(motor(20, 100, { ligacao: "trifasico" })).contaSemSolar).toBe(76.8);
  });

  it("C = 100, E = 100: mono para em K = 84,09 (piso 23,04); tri não compensa nada (C = D)", () => {
    const mono = completa(motor(100, 100, { ligacao: "monofasico" }));
    expect(mono).toMatchObject({ kwhCompensado: 84.09, contaComSolar: 23.04, economiaMensal: 53.76 });
    expect(mono.retrato.disponibilidadeKwh).toBe(30);
    const tri = completa(motor(100, 100, { ligacao: "trifasico" }));
    expect(tri).toMatchObject({ kwhCompensado: 0, contaSemSolar: 76.8, contaComSolar: 76.8, economiaMensal: 0 });
    expect(tri.retrato.disponibilidadeKwh).toBe(100);
  });

  it("só o bifásico declara a hipótese de 3 condutores", () => {
    expect(completa(motor(500, 300, { ligacao: "bifasico" })).retrato.ressalvas).toContain("bifasico_tres_condutores");
    expect(completa(motor(500, 300, { ligacao: "monofasico" })).retrato.ressalvas).not.toContain("bifasico_tres_condutores");
  });
});

describe("percentual pelo ano x componente pela vigência", () => {
  it("31/12/2026 usa 60%; 01/01/2027 usa 75% com a MESMA linha da REH 3.592", () => {
    const fim2026 = completa(motor(500, 300, { ctx: { dataReferencia: "2026-12-31" } }));
    const inicio2027 = completa(motor(500, 300, { ctx: { dataReferencia: "2027-01-01" } }));
    expect(fim2026.retrato.percentualLegalFioB).toBe(0.6);
    expect(inicio2027.retrato.percentualLegalFioB).toBe(0.75);
    expect(inicio2027.retrato.tarifaGdId).toBe(fim2026.retrato.tarifaGdId);
    expect(fim2026.contaComSolar).toBe(192.22);
    // 200 × 0,76802 + 300 × 0,1609017003 = 153,604 + 48,2705 = 201,8745
    expect(inicio2027).toMatchObject({ contaComSolar: 201.87, economiaMensal: 182.14 });
  });

  it("23/06/2027 (último dia da vigência) completa; 24/06/2027 fica incompleta, sem extrapolar a componente", () => {
    expect(motor(500, 300, { ctx: { dataReferencia: "2027-06-23" } }).estado).toBe("completa");
    const depois = motor(500, 300, { ctx: { dataReferencia: "2027-06-24" } });
    expect(depois.estado).toBe("incompleta");
    expect(codigos(depois)).toEqual(["fio_b_vigencia_fora"]);
    if (depois.estado === "incompleta") expect(depois.pendencias[0].mensagem).toBe("Sem tarifa vigente da COPEL-DIS para 24/06/2027.");
  });

  it("antes do início da vigência (23/06/2026) também fica incompleta", () => {
    expect(codigos(motor(500, 300, { ctx: { dataReferencia: "2026-06-23" } }))).toEqual(["fio_b_vigencia_fora"]);
  });

  it("ano sem percentual na regra aceita (2028) fica incompleto mesmo com linha vigente", () => {
    const linha2028 = { ...COPEL, id: "x", vigenciaInicio: "2027-06-24", vigenciaFim: "2028-06-23" };
    const r = motor(500, 300, { ctx: { dataReferencia: "2028-01-10", tarifas: [COPEL, linha2028] } });
    expect(codigos(r)).toEqual(["percentual_legal_indisponivel"]);
  });

  it("duas linhas vigentes na mesma data = ambígua (incompleta)", () => {
    const r = motor(500, 300, { ctx: { tarifas: [COPEL, { ...COPEL, id: "outra" }] } });
    expect(codigos(r)).toEqual(["tarifa_vigente_ambigua"]);
  });
});

describe("base tributária: sem mistura", () => {
  it("tarifa declarada com tributos x Fio B sem tributos: incompleta (sem conversão)", () => {
    expect(codigos(motor(500, 300, { base: "com_tributos" }))).toEqual(["base_tributaria_divergente"]);
  });

  it("base não declarada: incompleta", () => {
    expect(codigos(motor(500, 300, { base: null }))).toEqual(["base_tributaria_ausente"]);
  });

  it("tarifa personalizada sem tributos: completa, origem informada pelo vendedor", () => {
    const r = completa(motor(500, 300, { tarifa: 0.8 }));
    expect(r.retrato.tarifaOrigem).toBe("informada_vendedor");
    expect(r.contaSemSolar).toBe(400);
  });

  it("tarifa abaixo do custo da energia compensada: incompleta", () => {
    expect(codigos(motor(500, 300, { tarifa: 0.1 }))).toEqual(["tarifa_abaixo_do_fio_b"]);
  });
});

describe("enquadramento e distribuidora", () => {
  it("tipo de cliente ausente / não residencial: incompleta", () => {
    expect(codigos(motor(500, 300, { ctx: { tipoCliente: null } }))).toEqual(["enquadramento_ausente"]);
    expect(codigos(motor(500, 300, { ctx: { tipoCliente: "comercial" } }))).toEqual(["enquadramento_nao_suportado"]);
    expect(codigos(motor(500, 300, { ctx: { tipoCliente: "rural" } }))).toEqual(["enquadramento_nao_suportado"]);
  });

  it("distribuidora ausente ou sem tarifa cadastrada: incompleta; nome aceito sem acento/maiúsculas", () => {
    expect(codigos(motor(500, 300, { ctx: { distribuidoraInformada: null } }))).toEqual(["distribuidora_ausente"]);
    expect(codigos(motor(500, 300, { ctx: { distribuidoraInformada: "Cemig" } }))).toEqual(["distribuidora_sem_tarifa"]);
    expect(motor(500, 300, { ctx: { distribuidoraInformada: "  COPEL Distribuição " } }).estado).toBe("completa");
  });

  it("sem contexto (ex.: negócio novo, sem qualificação): incompleta, nunca número presumido", () => {
    const r = calcular({ potenciaKwp: 3, precoKit: 0, tipoLigacao: "bifasico", consumoMedioKwh: 500, tarifaKwh: 0.76802, produtividadeKwhKwpMes: 100 });
    expect(r.estado).toBe("incompleta");
    expect(codigos(r)).toEqual(expect.arrayContaining(["enquadramento_ausente", "distribuidora_ausente", "base_tributaria_ausente"]));
  });
});

describe("hipótese, limitações e payback", () => {
  it("todo resultado completo declara autoconsumo zero, Tabela 4 não conferida e payback indisponível", () => {
    const r = completa(motor(400, 500));
    expect(r.paybackMeses).toBeNull();
    expect(r.retrato.autoconsumoKwh).toBe(0);
    expect(r.retrato.ressalvas).toEqual(
      expect.arrayContaining(["autoconsumo_zero", "media_mensal", "tabela4_nao_conferida", "payback_indisponivel", "creditos_nao_valorados"]),
    );
  });

  it("sem energia sobrando, não há ressalva de créditos não valorados", () => {
    expect(completa(motor(500, 300)).retrato.ressalvas).not.toContain("creditos_nao_valorados");
  });
});
