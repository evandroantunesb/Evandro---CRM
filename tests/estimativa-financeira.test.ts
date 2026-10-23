/**
 * Pendências da estimativa financeira (contrato aceito, .aurora/contratos/m2-p0-decisao-fio-b-copel.md). Puro: o
 * contexto (data, qualificação, tarifa oficial) é montado aqui; as contas estão em fio-b-copel-casos.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  avaliarEstimativa,
  hojeIso,
  listaDePendencias,
  mensagemPropostaIncompleta,
  pendenciasSemDados,
  type EntradaEstimativa,
} from "@/lib/estimativa-financeira";
import {
  disponibilidadeArt291,
  enquadramentoDoTipoCliente,
  normalizarNome,
  percentualLegalFioB,
  resolverTarifa,
  tarifaOficialRsKwh,
  ENQUADRAMENTO_P0,
  type TarifaGd,
} from "@/lib/tarifa-gd";

const COPEL: TarifaGd = {
  id: "t1",
  distribuidora: "COPEL-DIS",
  nomesAceitos: ["copel", "copel-dis"],
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

const COMPLETA: EntradaEstimativa = {
  contexto: { dataReferencia: "2026-10-22", tipoCliente: "residencial", distribuidoraInformada: "Copel", tarifas: [COPEL] },
  tarifaBaseRsKwh: 0.76802,
  tarifaBaseBaseTributaria: "sem_tributos",
  consumoMedioKwh: 400,
  consumoOrigem: "informado",
  tarifaEfetivaContaRsKwh: null,
};

const com = (o: Partial<EntradaEstimativa>, ctx: Partial<NonNullable<EntradaEstimativa["contexto"]>> = {}): EntradaEstimativa => ({
  ...COMPLETA,
  ...o,
  contexto: { ...COMPLETA.contexto!, ...ctx },
});

const codigos = (e: EntradaEstimativa) => avaliarEstimativa(e).pendencias.map((p) => p.codigo);

describe("avaliarEstimativa", () => {
  it("entrada completa: sem pendências e com os dados regulatórios resolvidos", () => {
    const r = avaliarEstimativa(COMPLETA);
    expect(r.pendencias).toEqual([]);
    expect(r.dados).toEqual({ enquadramento: ENQUADRAMENTO_P0, tarifa: COPEL, percentualLegal: 0.6, dataReferencia: "2026-10-22" });
  });

  it("qualquer pendência zera os dados (nunca meio resultado)", () => {
    expect(avaliarEstimativa(com({ consumoMedioKwh: null })).dados).toBeNull();
  });

  it.each([
    ["consumo ausente", com({ consumoMedioKwh: null }), ["consumo_ausente"]],
    ["consumo NaN", com({ consumoMedioKwh: Number.NaN }), ["consumo_ausente"]],
    ["tarifa ausente", com({ tarifaBaseRsKwh: null }), ["tarifa_base_ausente"]],
    ["tarifa zero", com({ tarifaBaseRsKwh: 0 }), ["tarifa_base_ausente"]],
    ["base não declarada", com({ tarifaBaseBaseTributaria: null }), ["base_tributaria_ausente"]],
    ["base com tributos", com({ tarifaBaseBaseTributaria: "com_tributos" }), ["base_tributaria_divergente"]],
    ["tarifa abaixo de N", com({ tarifaBaseRsKwh: 0.12 }), ["tarifa_abaixo_do_fio_b"]],
    ["consumo pela conta em R$ sem tarifa efetiva", com({ consumoMedioKwh: null, consumoOrigem: "estimado_conta" }), ["consumo_ausente", "consumo_estimado_pela_tarifa_base"]],
    ["tipo de cliente ausente", com({}, { tipoCliente: null }), ["enquadramento_ausente"]],
    ["comercial", com({}, { tipoCliente: "comercial" }), ["enquadramento_nao_suportado"]],
    ["distribuidora ausente", com({}, { distribuidoraInformada: "  " }), ["distribuidora_ausente"]],
    ["distribuidora sem tarifa", com({}, { distribuidoraInformada: "Celesc" }), ["distribuidora_sem_tarifa"]],
    ["antes da vigência", com({}, { dataReferencia: "2026-06-23" }), ["fio_b_vigencia_fora"]],
    ["depois da vigência", com({}, { dataReferencia: "2027-06-24" }), ["fio_b_vigencia_fora"]],
    ["sem linha oficial carregada", com({}, { tarifas: [] }), ["distribuidora_sem_tarifa"]],
  ] as const)("%s", (_, entrada, esperado) => {
    expect(codigos(entrada)).toEqual(esperado);
  });

  it("acumula tudo em ordem estável e toda pendência tem mensagem", () => {
    const e = com({ tarifaBaseRsKwh: null, consumoMedioKwh: null, tarifaBaseBaseTributaria: null }, { tipoCliente: null, distribuidoraInformada: null });
    const r = avaliarEstimativa(e);
    expect(r.pendencias.map((p) => p.codigo)).toEqual([
      "enquadramento_ausente",
      "distribuidora_ausente",
      "tarifa_base_ausente",
      "consumo_ausente",
      "base_tributaria_ausente",
    ]);
    expect(r.pendencias.every((p) => p.mensagem.trim().length > 0)).toBe(true);
    expect(avaliarEstimativa(e)).toEqual(r);
  });

  it("fora da vigência cita a distribuidora e a data (dd/mm/aaaa)", () => {
    const r = avaliarEstimativa(com({}, { dataReferencia: "2027-06-24" }));
    expect(r.pendencias[0].mensagem).toBe("Sem tarifa vigente da COPEL-DIS para 24/06/2027.");
  });

  it("não altera a entrada", () => {
    const e = structuredClone(COMPLETA);
    avaliarEstimativa(e);
    expect(e).toEqual(COMPLETA);
  });
});

describe("tarifa-gd", () => {
  it("percentual legal pelo ANO da data: 2026 60%, 2027 75%, demais ausentes", () => {
    expect(percentualLegalFioB("2026-01-01")).toBe(0.6);
    expect(percentualLegalFioB("2026-12-31")).toBe(0.6);
    expect(percentualLegalFioB("2027-01-01")).toBe(0.75);
    expect(percentualLegalFioB("2025-12-31")).toBeNull();
    expect(percentualLegalFioB("2028-01-01")).toBeNull();
  });

  it("custo de disponibilidade pela ligação (art. 291)", () => {
    expect([disponibilidadeArt291("monofasico"), disponibilidadeArt291("bifasico"), disponibilidadeArt291("trifasico")]).toEqual([30, 50, 100]);
    expect(disponibilidadeArt291("outro")).toBeNull();
  });

  it("T oficial = (TE + TUSD) / 1000 com 5 casas", () => {
    expect(tarifaOficialRsKwh(COPEL)).toBe(0.76802);
  });

  it("enquadramento: só residencial tem regra", () => {
    expect(enquadramentoDoTipoCliente("residencial")).toEqual({ situacao: "ok", enquadramento: ENQUADRAMENTO_P0 });
    expect(enquadramentoDoTipoCliente(null)).toEqual({ situacao: "ausente" });
    expect(enquadramentoDoTipoCliente("industrial")).toEqual({ situacao: "nao_suportado", tipoCliente: "industrial" });
  });

  it("nome da distribuidora normalizado (acento, maiúsculas, espaços)", () => {
    expect(normalizarNome("  COPEL   Distribuição ")).toBe("copel distribuicao");
    expect(resolverTarifa([COPEL], "COPEL-DIS", ENQUADRAMENTO_P0, "2026-10-22").situacao).toBe("ok");
    expect(resolverTarifa([COPEL], "Copel Paraná", ENQUADRAMENTO_P0, "2026-10-22").situacao).toBe("sem_tarifa");
  });

  it("bordas da vigência: início e fim inclusivos", () => {
    expect(resolverTarifa([COPEL], "copel", ENQUADRAMENTO_P0, "2026-06-24").situacao).toBe("ok");
    expect(resolverTarifa([COPEL], "copel", ENQUADRAMENTO_P0, "2027-06-23").situacao).toBe("ok");
    expect(resolverTarifa([COPEL], "copel", ENQUADRAMENTO_P0, "2027-06-24").situacao).toBe("fora_da_vigencia");
  });
});

describe("auxiliares", () => {
  it("pendenciasSemDados: sem nenhum dado, pede enquadramento, distribuidora, tarifa, consumo e base", () => {
    expect(pendenciasSemDados().map((p) => p.codigo)).toEqual(
      expect.arrayContaining(["enquadramento_ausente", "distribuidora_ausente", "tarifa_base_ausente", "consumo_ausente", "base_tributaria_ausente"]),
    );
  });

  it("hojeIso: AAAA-MM-DD no fuso de São Paulo", () => {
    expect(hojeIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hojeIso()).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  });

  it("listaDePendencias: sem o ponto final de cada item, separadas por '; '", () => {
    expect(
      listaDePendencias([
        { codigo: "consumo_ausente", mensagem: "Informe o consumo médio em kWh." },
        { codigo: "tarifa_base_ausente", mensagem: "Informe a tarifa (R$/kWh)." },
      ]),
    ).toBe("Informe o consumo médio em kWh; Informe a tarifa (R$/kWh)");
  });

  it("mensagemPropostaIncompleta: texto exato, com e sem a frase extra", () => {
    const p = [{ codigo: "consumo_ausente" as const, mensagem: "Informe o consumo médio em kWh." }];
    expect(mensagemPropostaIncompleta(p)).toBe(
      "A estimativa financeira está incompleta: Informe o consumo médio em kWh. A proposta fica disponível quando os dados forem validados.",
    );
    expect(mensagemPropostaIncompleta(p, "extra")).toBe(
      "A estimativa financeira está incompleta: extra; Informe o consumo médio em kWh. A proposta fica disponível quando os dados forem validados.",
    );
  });
});
