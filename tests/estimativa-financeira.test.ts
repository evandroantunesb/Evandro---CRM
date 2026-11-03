// Testes PUROS do contrato "estimativa financeira incompleta" (M2 P0).
// Todos os dados abaixo sao FICTICIOS: nenhum valor representa tarifa ou Fio B
// oficial da Copel/ANEEL. Regra de ouro: informacao ausente NUNCA vira zero,
// tarifa padrao ou percentual inventado.
import { describe, expect, it } from "vitest";
import {
  ENQUADRAMENTO_NAO_INFORMADO,
  MENSAGEM_FORMULA_NAO_VALIDADA,
  RECORTE_P0,
  avaliarCompletude,
  avaliarEstimativa,
  hojeIso,
  listaDePendencias,
  mensagemPropostaIncompleta,
  pendenciasSemDados,
  percentualLegalFioB,
} from "@/lib/estimativa-financeira";

type Entrada = Parameters<typeof avaliarCompletude>[0];
type Parametros = NonNullable<Entrada["parametrosFioB"]>;
type Enq = Entrada["enquadramento"];

const INICIO = "2026-03-01";
const FIM = "2026-09-30";

function parametrosManual(over: Partial<Parametros> = {}): Parametros {
  return {
    fioBRsKwh: 0.111, // FICTICIO
    baseTributaria: "com_tributos",
    origem: "manual_justificado",
    distribuidora: "Distribuidora FICTICIA",
    fonte: "Fonte FICTICIA de teste",
    vigenciaInicio: INICIO,
    vigenciaFim: FIM,
    justificativa: "Justificativa FICTICIA de teste",
    ...over,
  };
}

function completa(): Entrada {
  return {
    enquadramento: { ...RECORTE_P0 },
    tarifaBaseRsKwh: 0.999, // FICTICIO
    tarifaBaseBaseTributaria: "com_tributos",
    consumoMedioKwh: 321, // FICTICIO
    consumoOrigem: "informado",
    tarifaEfetivaContaRsKwh: null,
    parametrosFioB: parametrosManual(),
    dataReferencia: "2026-06-15",
  };
}

function com(over: Partial<Entrada>): Entrada {
  return { ...completa(), ...over };
}
function comFioB(over: Partial<Parametros>): Entrada {
  return com({ parametrosFioB: parametrosManual(over) });
}
function comEnq(over: Partial<Enq>): Entrada {
  return com({ enquadramento: { ...RECORTE_P0, ...over } });
}

function codigos(e: Entrada): string[] {
  const r = avaliarCompletude(e);
  return r.completa ? [] : r.pendencias.map((p) => p.codigo);
}

describe("estimativa financeira (dados FICTICIOS) - entrada completa", () => {
  it("origem manual_justificado com fonte e justificativa completa", () => {
    expect(avaliarCompletude(completa())).toEqual({ completa: true });
  });

  it("origem oficial_aneel (FICTICIA) completa", () => {
    const e = comFioB({ origem: "oficial_aneel", justificativa: null });
    expect(avaliarCompletude(e)).toEqual({ completa: true });
  });

  it("consumo estimado pela conta com tarifa efetiva valida completa", () => {
    const e = com({ consumoOrigem: "estimado_conta", tarifaEfetivaContaRsKwh: 0.85 });
    expect(avaliarCompletude(e)).toEqual({ completa: true });
  });
});

describe("estimativa financeira - pendencias isoladas", () => {
  const casos: [string, Entrada, string[]][] = [
    ["distribuidora_ausente (null)", comFioB({ distribuidora: null }), ["distribuidora_ausente"]],
    ["distribuidora_ausente (vazia)", comFioB({ distribuidora: "" }), ["distribuidora_ausente"]],
    ["distribuidora_ausente (so espacos)", comFioB({ distribuidora: "   " }), ["distribuidora_ausente"]],
    ["tarifa_base_ausente (null)", com({ tarifaBaseRsKwh: null }), ["tarifa_base_ausente"]],
    ["tarifa_base_ausente (0)", com({ tarifaBaseRsKwh: 0 }), ["tarifa_base_ausente"]],
    ["tarifa_base_ausente (negativa)", com({ tarifaBaseRsKwh: -0.5 }), ["tarifa_base_ausente"]],
    ["tarifa_base_ausente (NaN)", com({ tarifaBaseRsKwh: Number.NaN }), ["tarifa_base_ausente"]],
    ["tarifa_base_ausente (Infinity)", com({ tarifaBaseRsKwh: Infinity }), ["tarifa_base_ausente"]],
    ["consumo_ausente (null)", com({ consumoMedioKwh: null }), ["consumo_ausente"]],
    ["consumo_ausente (0)", com({ consumoMedioKwh: 0 }), ["consumo_ausente"]],
    ["consumo_ausente (negativo)", com({ consumoMedioKwh: -10 }), ["consumo_ausente"]],
    ["consumo_ausente (NaN)", com({ consumoMedioKwh: Number.NaN }), ["consumo_ausente"]],
    ["consumo_ausente (Infinity)", com({ consumoMedioKwh: Infinity }), ["consumo_ausente"]],
    [
      "consumo_estimado_pela_tarifa_base (sem tarifa efetiva)",
      com({ consumoOrigem: "estimado_conta", tarifaEfetivaContaRsKwh: null }),
      ["consumo_estimado_pela_tarifa_base"],
    ],
    ["fio_b_ausente (null)", comFioB({ fioBRsKwh: null }), ["fio_b_ausente"]],
    ["fio_b_origem_ausente", comFioB({ origem: null }), ["fio_b_origem_ausente"]],
    [
      "fio_b_manual_sem_justificativa (justificativa null)",
      comFioB({ justificativa: null }),
      ["fio_b_manual_sem_justificativa"],
    ],
    [
      "fio_b_manual_sem_justificativa (justificativa vazia)",
      comFioB({ justificativa: "  " }),
      ["fio_b_manual_sem_justificativa"],
    ],
    [
      "fio_b_manual_sem_justificativa (sem fonte)",
      comFioB({ fonte: null }),
      ["fio_b_manual_sem_justificativa"],
    ],
    [
      "fio_b_vigencia_ausente (inicio e fim null)",
      comFioB({ vigenciaInicio: null, vigenciaFim: null }),
      ["fio_b_vigencia_ausente"],
    ],
    [
      "fio_b_vigencia_fora (data apos o fim)",
      com({ dataReferencia: "2026-12-01" }),
      ["fio_b_vigencia_fora"],
    ],
    [
      "fio_b_vigencia_fora (data antes do inicio)",
      com({ dataReferencia: "2026-01-10" }),
      ["fio_b_vigencia_fora"],
    ],
    [
      "base_tributaria_divergente (Fio B sem_tributos x tarifa com_tributos)",
      comFioB({ baseTributaria: "sem_tributos" }),
      ["base_tributaria_divergente"],
    ],
  ];

  it.each(casos)("%s", (_nome, entrada, esperado) => {
    const r = avaliarCompletude(entrada);
    expect(r.completa).toBe(false);
    expect(codigos(entrada)).toEqual(esperado);
  });

  it("toda pendencia traz mensagem nao vazia", () => {
    const r = avaliarCompletude(com({ tarifaBaseRsKwh: null }));
    if (r.completa) throw new Error("deveria ser incompleta");
    for (const p of r.pendencias) {
      expect(typeof p.mensagem).toBe("string");
      expect(p.mensagem.trim().length).toBeGreaterThan(0);
    }
  });

  it("parametrosFioB inteiro ausente (null) e incompleto e acusa fio_b_ausente", () => {
    const e = com({ parametrosFioB: null });
    expect(avaliarCompletude(e).completa).toBe(false);
    expect(codigos(e)).toContain("fio_b_ausente");
  });

  it("vigencia com so um dos limites ausente nao completa", () => {
    expect(avaliarCompletude(comFioB({ vigenciaInicio: null })).completa).toBe(false);
    expect(avaliarCompletude(comFioB({ vigenciaFim: null })).completa).toBe(false);
  });
});

describe("estimativa financeira - Fio B nunca vira zero", () => {
  it.each([
    ["zero", 0],
    ["negativo", -0.05],
    ["NaN", Number.NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("fioBRsKwh = %s => fio_b_ausente e nao completa", (_n, valor) => {
    const e = comFioB({ fioBRsKwh: valor });
    expect(avaliarCompletude(e).completa).toBe(false);
    expect(codigos(e)).toContain("fio_b_ausente");
  });
});

describe("estimativa financeira - fronteiras de vigencia", () => {
  it("dataReferencia == vigenciaInicio completa", () => {
    expect(avaliarCompletude(com({ dataReferencia: INICIO }))).toEqual({ completa: true });
  });
  it("dataReferencia == vigenciaFim completa", () => {
    expect(avaliarCompletude(com({ dataReferencia: FIM }))).toEqual({ completa: true });
  });
  it("um dia antes do inicio => fio_b_vigencia_fora", () => {
    expect(codigos(com({ dataReferencia: "2026-02-28" }))).toEqual(["fio_b_vigencia_fora"]);
  });
  it("um dia depois do fim => fio_b_vigencia_fora", () => {
    expect(codigos(com({ dataReferencia: "2026-10-01" }))).toEqual(["fio_b_vigencia_fora"]);
  });
});

describe("estimativa financeira - recorte P0 e percentual legal", () => {
  it("RECORTE_P0 e B1 / convencional / GD_II / 2026", () => {
    expect(RECORTE_P0).toEqual({
      classe: "B1",
      modalidade: "convencional",
      gd: "GD_II",
      anoReferencia: 2026,
    });
  });

  it("recorte exato => percentual 0.6 e completa", () => {
    expect(percentualLegalFioB({ ...RECORTE_P0 })).toBe(0.6);
    expect(avaliarCompletude(completa()).completa).toBe(true);
  });

  it.each<[string, Partial<Enq>]>([
    ["classe B2", { classe: "B2" }],
    ["modalidade Branca", { modalidade: "Branca" }],
    ["GD_I", { gd: "GD_I" }],
    ["GD_III", { gd: "GD_III" }],
    ["ano 2025", { anoReferencia: 2025 }],
    ["ano 2027", { anoReferencia: 2027 }],
  ])("%s => nao suportado, sem percentual legal", (_n, over) => {
    const enq = { ...RECORTE_P0, ...over } as Enq;
    expect(percentualLegalFioB(enq)).toBeNull();
    const c = codigos(comEnq(over));
    expect(c).toContain("enquadramento_nao_suportado");
    expect(c).toContain("percentual_legal_indisponivel");
    expect(c).not.toContain("enquadramento_ausente");
    expect(avaliarCompletude(comEnq(over)).completa).toBe(false);
  });

  it.each<[string, Partial<Enq>]>([
    ["classe null", { classe: null }],
    ["modalidade null", { modalidade: null }],
    ["gd null", { gd: null }],
    ["ano null", { anoReferencia: null }],
  ])("%s => enquadramento_ausente, sem percentual legal", (_n, over) => {
    const enq = { ...RECORTE_P0, ...over } as Enq;
    expect(percentualLegalFioB(enq)).toBeNull();
    const c = codigos(comEnq(over));
    expect(c).toContain("enquadramento_ausente");
    expect(c).not.toContain("enquadramento_nao_suportado");
    expect(avaliarCompletude(comEnq(over)).completa).toBe(false);
  });
});

describe("estimativa financeira - consumo estimado pela conta em R$", () => {
  it.each([
    ["null", null],
    ["zero", 0],
    ["negativa", -1],
    ["NaN", Number.NaN],
    ["Infinity", Infinity],
  ])("estimado_conta com tarifa efetiva %s => consumo_estimado_pela_tarifa_base", (_n, v) => {
    const e = com({ consumoOrigem: "estimado_conta", tarifaEfetivaContaRsKwh: v });
    expect(avaliarCompletude(e).completa).toBe(false);
    expect(codigos(e)).toContain("consumo_estimado_pela_tarifa_base");
  });

  it("estimado_conta com tarifa efetiva valida nao gera a pendencia", () => {
    const e = com({ consumoOrigem: "estimado_conta", tarifaEfetivaContaRsKwh: 0.85 });
    expect(codigos(e)).not.toContain("consumo_estimado_pela_tarifa_base");
  });

  it("consumo informado nao exige tarifa efetiva", () => {
    const e = com({ consumoOrigem: "informado", tarifaEfetivaContaRsKwh: null });
    expect(avaliarCompletude(e)).toEqual({ completa: true });
  });
});

describe("estimativa financeira - base tributaria", () => {
  it("Fio B com base diferente da tarifa base => divergente", () => {
    expect(codigos(comFioB({ baseTributaria: "sem_tributos" }))).toEqual([
      "base_tributaria_divergente",
    ]);
  });

  it("tarifa sem_tributos e Fio B com_tributos => divergente", () => {
    const e = com({ tarifaBaseBaseTributaria: "sem_tributos" });
    expect(codigos(e)).toEqual(["base_tributaria_divergente"]);
  });

  it("base tributaria do Fio B ausente => divergente", () => {
    expect(codigos(comFioB({ baseTributaria: null }))).toEqual(["base_tributaria_divergente"]);
  });

  it("base tributaria da tarifa base ausente => divergente", () => {
    expect(codigos(com({ tarifaBaseBaseTributaria: null }))).toContain(
      "base_tributaria_divergente",
    );
  });

  it("bases iguais sem_tributos completam", () => {
    const e = {
      ...comFioB({ baseTributaria: "sem_tributos" }),
      tarifaBaseBaseTributaria: "sem_tributos" as const,
    };
    expect(avaliarCompletude(e)).toEqual({ completa: true });
  });
});

describe("estimativa financeira - acumulo e ordem estavel", () => {
  const faltas = (): Entrada => ({
    enquadramento: { classe: "B2", modalidade: null, gd: "GD_I", anoReferencia: 2025 },
    tarifaBaseRsKwh: null,
    tarifaBaseBaseTributaria: "com_tributos",
    consumoMedioKwh: 0,
    consumoOrigem: "estimado_conta",
    tarifaEfetivaContaRsKwh: null,
    parametrosFioB: {
      fioBRsKwh: 0,
      baseTributaria: "sem_tributos",
      origem: null,
      distribuidora: "",
      fonte: null,
      vigenciaInicio: null,
      vigenciaFim: null,
      justificativa: null,
    },
    dataReferencia: "2026-06-15",
  });

  // Ambiguo no contrato: enquadramento com campo null E diferente do recorte
  // ao mesmo tempo. Ver checkpoint. Aqui so exigimos que 'enquadramento_ausente'
  // esteja presente e que o restante acumule.
  const esperadasSempre = [
    "enquadramento_ausente",
    "distribuidora_ausente",
    "tarifa_base_ausente",
    "consumo_ausente",
    "consumo_estimado_pela_tarifa_base",
    "fio_b_ausente",
    "fio_b_origem_ausente",
    "fio_b_vigencia_ausente",
    "base_tributaria_divergente",
  ];

  it("acumula todas as pendencias aplicaveis, sem duplicar", () => {
    const c = codigos(faltas());
    expect(c).toEqual(expect.arrayContaining(esperadasSempre));
    expect(new Set(c).size).toBe(c.length);
  });

  it("ordem e deterministica entre chamadas", () => {
    expect(codigos(faltas())).toEqual(codigos(faltas()));
  });

  it("ordem nao depende da ordem das chaves do objeto de entrada", () => {
    const a = faltas();
    const b = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse())));
    expect(codigos(b)).toEqual(codigos(a));
  });

  it("ordem segue a ordem dos codigos do contrato (ver duvida no checkpoint)", () => {
    const ordem = [
      "enquadramento_nao_suportado",
      "enquadramento_ausente",
      "distribuidora_ausente",
      "tarifa_base_ausente",
      "consumo_ausente",
      "consumo_estimado_pela_tarifa_base",
      "fio_b_ausente",
      "fio_b_origem_ausente",
      "fio_b_manual_sem_justificativa",
      "fio_b_vigencia_ausente",
      "fio_b_vigencia_fora",
      "base_tributaria_divergente",
      "percentual_legal_indisponivel",
    ];
    const idx = codigos(faltas()).map((x) => ordem.indexOf(x));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });

  it("enquadramento nao suportado + vigencia fora + manual sem justificativa acumulam", () => {
    const e = {
      ...com({ enquadramento: { ...RECORTE_P0, gd: "GD_I" }, dataReferencia: "2027-01-01" }),
      parametrosFioB: parametrosManual({ justificativa: null }),
    };
    expect(codigos(e)).toEqual(
      expect.arrayContaining([
        "enquadramento_nao_suportado",
        "percentual_legal_indisponivel",
        "fio_b_manual_sem_justificativa",
        "fio_b_vigencia_fora",
      ]),
    );
  });
});

describe("estimativa financeira - imutabilidade e pureza", () => {
  it("avaliarCompletude nao altera a entrada (incompleta)", () => {
    const e = com({ tarifaBaseRsKwh: null, parametrosFioB: parametrosManual({ fioBRsKwh: 0 }) });
    const copia = structuredClone(e);
    avaliarCompletude(e);
    expect(e).toEqual(copia);
  });

  it("avaliarCompletude nao altera a entrada (completa)", () => {
    const e = completa();
    const copia = structuredClone(e);
    avaliarCompletude(e);
    expect(e).toEqual(copia);
  });

  it("percentualLegalFioB nao altera o enquadramento", () => {
    const enq = { ...RECORTE_P0 } as Enq;
    const copia = structuredClone(enq);
    percentualLegalFioB(enq);
    expect(enq).toEqual(copia);
  });

  it("mesma entrada, mesmo resultado (sem dependencia de hora real)", () => {
    const e = completa();
    expect(avaliarCompletude(e)).toEqual(avaliarCompletude(e));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M2-Q6: porta única do motor. `avaliarEstimativa` devolve SEMPRE a estimativa incompleta (a fórmula não foi
// validada): mesmo com TODOS os dados presentes a pendência `formula_nao_validada` permanece. Nunca há número
// financeiro. Dados FICTICIOS.
// ---------------------------------------------------------------------------------------------------------------
type EntradaMotor = Parameters<typeof avaliarEstimativa>[0];

function motor(over: Partial<EntradaMotor> = {}): EntradaMotor {
  return { ...completa(), potenciaKwp: 5, produtividadeKwhKwpMes: 120, ...over };
}

const codigosDoMotor = (e: EntradaMotor) => avaliarEstimativa(e).pendencias.map((p) => p.codigo);

describe("avaliarEstimativa: sempre incompleta, formula_nao_validada sempre presente", () => {
  it("entrada COMPLETA (avaliarCompletude diz completa): continua incompleta, só com formula_nao_validada", () => {
    expect(avaliarCompletude(completa())).toEqual({ completa: true });
    const r = avaliarEstimativa(motor());
    expect(r.estado).toBe("incompleta");
    expect(r.pendencias).toEqual([{ codigo: "formula_nao_validada", mensagem: "A regra de cálculo da economia ainda não foi validada." }]);
    expect(MENSAGEM_FORMULA_NAO_VALIDADA).toBe("A regra de cálculo da economia ainda não foi validada.");
  });

  it("devolve geração e potência, e nenhum número financeiro", () => {
    const r = avaliarEstimativa(motor());
    expect(r.geracaoEstimadaKwhMes).toBe(600);
    expect(r.potenciaKwp).toBe(5);
    expect(Object.keys(r).sort()).toEqual(["estado", "geracaoEstimadaKwhMes", "pendencias", "potenciaKwp"]);
  });

  it("entrada incompleta: as pendências dos dados, na ordem, e formula_nao_validada por último", () => {
    const e = motor({ tarifaBaseRsKwh: null, parametrosFioB: null });
    const esperadoDados = codigos(e);
    expect(esperadoDados.length).toBeGreaterThan(0);
    expect(codigosDoMotor(e)).toEqual([...esperadoDados, "formula_nao_validada"]);
  });

  it("formula_nao_validada aparece exatamente uma vez em toda entrada (varredura dos casos isolados e acumulados)", () => {
    const entradas: EntradaMotor[] = [
      motor(),
      motor({ consumoMedioKwh: null }),
      motor({ tarifaBaseRsKwh: 0 }),
      motor({ parametrosFioB: null }),
      motor({ dataReferencia: "2030-01-01" }),
      motor({ enquadramento: { ...RECORTE_P0, gd: "GD_I" } }),
      motor({ enquadramento: ENQUADRAMENTO_NAO_INFORMADO, parametrosFioB: null, consumoMedioKwh: null, tarifaBaseRsKwh: null }),
      motor({ consumoOrigem: "estimado_conta", tarifaEfetivaContaRsKwh: null }),
      motor({ potenciaKwp: null, produtividadeKwhKwpMes: null }),
    ];
    for (const e of entradas) {
      const c = codigosDoMotor(e);
      expect(c.filter((x) => x === "formula_nao_validada")).toHaveLength(1);
      expect(c[c.length - 1]).toBe("formula_nao_validada");
      expect(avaliarEstimativa(e).estado).toBe("incompleta");
    }
  });

  it("nenhuma pendência de dados some por causa da fórmula: as de avaliarCompletude estão todas presentes", () => {
    for (const [, entrada] of [
      ["fio b ausente", comFioB({ fioBRsKwh: null })],
      ["consumo", com({ consumoMedioKwh: null })],
      ["base", com({ tarifaBaseBaseTributaria: null })],
    ] as [string, Entrada][]) {
      const dados = codigos(entrada);
      const doMotor = codigosDoMotor({ ...entrada, potenciaKwp: 5, produtividadeKwhKwpMes: 120 });
      for (const c of dados) expect(doMotor).toContain(c);
    }
  });

  it("toda pendência traz mensagem não vazia", () => {
    const r = avaliarEstimativa(motor({ parametrosFioB: null, consumoMedioKwh: null }));
    for (const p of r.pendencias) expect(p.mensagem.trim().length).toBeGreaterThan(0);
  });

  describe("geração (potência × produtividade, 2 casas)", () => {
    it("arredonda a 2 casas: 3,33 × 121,7 = 405,261 -> 405,26", () => {
      expect(avaliarEstimativa(motor({ potenciaKwp: 3.33, produtividadeKwhKwpMes: 121.7 })).geracaoEstimadaKwhMes).toBe(405.26);
    });

    it.each([
      ["potência null", { potenciaKwp: null }],
      ["potência 0", { potenciaKwp: 0 }],
      ["potência negativa", { potenciaKwp: -1 }],
      ["potência NaN", { potenciaKwp: Number.NaN }],
      ["potência Infinity", { potenciaKwp: Infinity }],
      ["produtividade null", { produtividadeKwhKwpMes: null }],
      ["produtividade 0", { produtividadeKwhKwpMes: 0 }],
      ["produtividade negativa", { produtividadeKwhKwpMes: -3 }],
      ["produtividade NaN", { produtividadeKwhKwpMes: Number.NaN }],
    ] as [string, Partial<EntradaMotor>][])("%s => geração null (nunca 0 inventado)", (_n, over) => {
      const r = avaliarEstimativa(motor(over));
      expect(r.geracaoEstimadaKwhMes).toBeNull();
      expect(r.estado).toBe("incompleta");
    });

    it("potência inválida => potenciaKwp null; válida => repassada sem arredondar", () => {
      expect(avaliarEstimativa(motor({ potenciaKwp: 0 })).potenciaKwp).toBeNull();
      expect(avaliarEstimativa(motor({ potenciaKwp: null })).potenciaKwp).toBeNull();
      expect(avaliarEstimativa(motor({ potenciaKwp: 5.505 })).potenciaKwp).toBe(5.505);
    });
  });

  it("não altera a entrada e é determinística", () => {
    const e = motor({ parametrosFioB: null });
    const copia = structuredClone(e);
    expect(avaliarEstimativa(e)).toEqual(avaliarEstimativa(e));
    expect(e).toEqual(copia);
  });
});

describe("auxiliares da estimativa incompleta", () => {
  it("ENQUADRAMENTO_NAO_INFORMADO: tudo nulo", () => {
    expect(ENQUADRAMENTO_NAO_INFORMADO).toEqual({ classe: null, modalidade: null, gd: null, anoReferencia: null });
  });

  it("pendenciasSemDados: o que existe hoje em todo negócio (nenhum dado da estimativa), com a fórmula por último", () => {
    expect(pendenciasSemDados().map((p) => p.codigo)).toEqual([
      "enquadramento_ausente",
      "distribuidora_ausente",
      "tarifa_base_ausente",
      "consumo_ausente",
      "fio_b_ausente",
      "base_tributaria_divergente",
      "formula_nao_validada",
    ]);
  });

  it("hojeIso: AAAA-MM-DD da data atual (UTC)", () => {
    const antes = new Date().toISOString().slice(0, 10);
    const h = hojeIso();
    const depois = new Date().toISOString().slice(0, 10);
    expect(h).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([antes, depois]).toContain(h);
  });

  it("listaDePendencias: sem o ponto final de cada item, separadas por '; '", () => {
    const lista = listaDePendencias([
      { codigo: "consumo_ausente", mensagem: "Informe o consumo médio em kWh." },
      { codigo: "fio_b_ausente", mensagem: "Informe o Fio B" },
      { codigo: "formula_nao_validada", mensagem: "A regra ainda não foi validada.  " },
    ]);
    expect(lista).toBe("Informe o consumo médio em kWh; Informe o Fio B; A regra ainda não foi validada");
  });

  it("mensagemPropostaIncompleta: texto exato, com e sem a frase extra (que vem antes da lista)", () => {
    const p = [
      { codigo: "consumo_ausente" as const, mensagem: "Informe o consumo médio em kWh." },
      { codigo: "formula_nao_validada" as const, mensagem: MENSAGEM_FORMULA_NAO_VALIDADA },
    ];
    expect(mensagemPropostaIncompleta(p)).toBe(
      "A estimativa financeira está incompleta: Informe o consumo médio em kWh; A regra de cálculo da economia ainda não foi validada. A proposta fica disponível quando os dados forem validados.",
    );
    expect(mensagemPropostaIncompleta(p, "o último cálculo foi feito pela fórmula antiga, que não foi validada")).toBe(
      "A estimativa financeira está incompleta: o último cálculo foi feito pela fórmula antiga, que não foi validada; Informe o consumo médio em kWh; A regra de cálculo da economia ainda não foi validada. A proposta fica disponível quando os dados forem validados.",
    );
  });
});
