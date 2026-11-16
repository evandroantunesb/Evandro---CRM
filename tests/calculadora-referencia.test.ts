/**
 * Caso de referência da calculadora: 1.500 kWh/mês em Cascavel/PR (Copel, B1 residencial, GD II, 2026).
 *
 * Os parâmetros abaixo (potências, produtividade de 125 kWh/kWp/mês, tipos de ligação) e os resultados foram definidos
 * e APROVADOS pelo Evandro em 16/11/2026 como referência do projeto; não houve validação do engenheiro. Os valores esperados
 * foram calculados à parte do motor (aritmética decimal, fórmula do contrato m2-p0-decisao-fio-b-copel.md) e conferem
 * o motor número a número. Trocar pelos números do engenheiro quando houver: só mudar as constantes e a tabela.
 *
 *   T = (TE 310,85 + TUSD 457,17) / 1000 = 0,76802 R$/kWh (sem tributos)
 *   N = 60% (2026) × Fio B 214,535600374 / 1000 = 0,1287213602244 R$/kWh
 *   K = min(E, C, ((C − D) × T) / (T − N));  sem solar = max(C, D) × T;  com solar = max(D × T, (C − K) × T + K × N)
 */
import { describe, expect, it } from "vitest";
import { calcular, type EntradaCalculo, type ResultadoCalculoCompleto } from "@/lib/calculadora";
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

const CONTEXTO: ContextoEstimativa = { dataReferencia: "2026-10-22", tipoCliente: "residencial", distribuidoraInformada: "Copel", tarifas: [COPEL] };

const CONSUMO_KWH = 1500;
const TARIFA = 0.76802;
const PRODUTIVIDADE = 125;

function calcularCaso(potenciaKwp: number, tipoLigacao: EntradaCalculo["tipoLigacao"]): ResultadoCalculoCompleto {
  const r = calcular({
    potenciaKwp,
    precoKit: 60000,
    tipoLigacao,
    consumoMedioKwh: CONSUMO_KWH,
    tarifaKwh: TARIFA,
    produtividadeKwhKwpMes: PRODUTIVIDADE,
    dadosEstimativa: { contexto: CONTEXTO, tarifaBaseTributaria: "sem_tributos" },
  });
  if (r.estado !== "completa") throw new Error(`esperava a estimativa completa: ${JSON.stringify(r)}`);
  return r;
}

const CASOS = [
  { nome: "12 kWp trifásico: gera 100% do consumo", kwp: 12, ligacao: "trifasico", geracao: 1500, compensado: 1500, faturado: 0, naoCompensado: 0, fioB: 193.08, sem: 1152.03, com: 193.08, economia: 958.95 },
  { nome: "10 kWp trifásico: gera 83% do consumo", kwp: 10, ligacao: "trifasico", geracao: 1250, compensado: 1250, faturado: 250, naoCompensado: 0, fioB: 160.9, sem: 1152.03, com: 352.91, economia: 799.12 },
  { nome: "8 kWp monofásico: gera 67% do consumo (piso de 30 kWh)", kwp: 8, ligacao: "monofasico", geracao: 1000, compensado: 1000, faturado: 500, naoCompensado: 0, fioB: 128.72, sem: 1152.03, com: 512.73, economia: 639.3 },
  { nome: "14 kWp trifásico: sobra 250 kWh (crédito não valorado)", kwp: 14, ligacao: "trifasico", geracao: 1750, compensado: 1500, faturado: 0, naoCompensado: 250, fioB: 193.08, sem: 1152.03, com: 193.08, economia: 958.95 },
] as const;

describe("calculadora: referência de 1.500 kWh/mês em Cascavel/PR (parâmetros ilustrativos)", () => {
  it.each(CASOS)("$nome", (c) => {
    const r = calcularCaso(c.kwp, c.ligacao);
    expect(r.geracaoEstimadaKwhMes).toBe(c.geracao);
    expect(r.kwhCompensado).toBe(c.compensado);
    expect(r.kwhFaturado).toBe(c.faturado);
    expect(r.kwhNaoCompensado).toBe(c.naoCompensado);
    expect(r.custoFioB).toBe(c.fioB);
    expect(r.contaSemSolar).toBe(c.sem);
    expect(r.contaComSolar).toBe(c.com);
    expect(r.economiaMensal).toBe(c.economia);
    expect(r.paybackMeses).toBeNull();
  });

  it.each(CASOS)("os números exibidos fecham: conta hoje − conta com sistema = economia ($nome)", (c) => {
    const r = calcularCaso(c.kwp, c.ligacao);
    expect(Math.round((r.contaSemSolar - r.contaComSolar) * 100)).toBe(Math.round(r.economiaMensal * 100));
  });

  it("o retrato grava o que o cálculo usou (percentual de 2026, Fio B, N, piso pela ligação, tarifa oficial)", () => {
    const tri = calcularCaso(12, "trifasico").retrato;
    expect(tri).toMatchObject({
      distribuidora: "COPEL-DIS",
      ato: "REH 3.592/2026",
      percentualLegalFioB: 0.6,
      fioBRsMwh: 214.535600374,
      disponibilidadeKwh: 100,
      tarifaOficialRsKwh: TARIFA,
      tarifaOrigem: "oficial_aneel",
      autoconsumoKwh: 0,
    });
    expect(tri.custoEnergiaCompensadaRsKwh).toBeCloseTo(0.1287213602244, 12);
    expect(calcularCaso(8, "monofasico").retrato.disponibilidadeKwh).toBe(30);
  });

  it("só o caso com sobra avisa que os créditos não são valorados", () => {
    expect(calcularCaso(14, "trifasico").retrato.ressalvas).toContain("creditos_nao_valorados");
    expect(calcularCaso(12, "trifasico").retrato.ressalvas).not.toContain("creditos_nao_valorados");
  });

  it("mais potência nunca piora a conta (economia não decresce de 8 para 14 kWp)", () => {
    const economias = [8, 10, 12, 14].map((kwp) => calcularCaso(kwp, "trifasico").economiaMensal);
    for (let i = 1; i < economias.length; i++) expect(economias[i]).toBeGreaterThanOrEqual(economias[i - 1]);
  });
});
