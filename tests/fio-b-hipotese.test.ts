// Testes PUROS da formula-HIPOTESE do Fio B (B1 convencional, GD II, 2026, sem
// banco de creditos). Todos os dados sao FICTICIOS; nada aqui e tarifa ou Fio B
// oficial. Nao e o motor da calculadora.
//
// Formula:  K = min(E, C, max(0, ((C - D) * T) / (T - N)))
//   com solar = max(D*T, (C - K)*T + K*N);  sem solar = C*T
//   N = custo da energia compensada (Fio B * 0,60, ja resolvido pelo chamador
//   na base tributaria de T). Exige T > N >= 0.
import { describe, expect, it } from "vitest";
import {
  METODO_FIO_B_HIPOTESE,
  calcularFioBHipotese,
  type EntradaFioBHipotese,
} from "@/lib/fio-b-hipotese";
import { RECORTE_P0, avaliarCompletude } from "@/lib/estimativa-financeira";

// FICTICIO: T=1,00; Fio B=0,30 => N=0,18; D=30.
const base: EntradaFioBHipotese = {
  consumoTotalKwh: 500,
  geracaoTotalKwh: 600,
  tarifaCheiaRsKwh: 1.0,
  custoDisponibilidadeKwh: 30,
  custoEnergiaCompensadaRsKwh: 0.18,
};
const com = (o: Partial<EntradaFioBHipotese>): EntradaFioBHipotese => ({ ...base, ...o });

function ok(e: EntradaFioBHipotese) {
  const r = calcularFioBHipotese(e);
  if (!r.ok) throw new Error(`esperava sucesso, veio erro: ${r.motivo}`);
  return r;
}

describe("fio-b-hipotese (FICTICIO) - exemplos de referencia", () => {
  it("C=500, E=600 => K=500, com solar 90,00, sem solar 500,00", () => {
    const r = ok(base);
    expect(r.metodo).toBe(METODO_FIO_B_HIPOTESE);
    expect(r.energiaCompensadaKwh).toBe(500);
    expect(r.contaComSolar).toBe(90);
    expect(r.contaSemSolar).toBe(500);
    expect(r.economiaMensal).toBe(410);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(100);
  });

  it("C=500, E=490 => K=490, com solar 98,20", () => {
    const r = ok(com({ geracaoTotalKwh: 490 }));
    expect(r.energiaCompensadaKwh).toBe(490);
    expect(r.contaComSolar).toBe(98.2);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(0);
  });

  it("C=100, E=95 => K ~ 85,37, conta 30,00 (piso limita; Fio B absorvido)", () => {
    const r = ok(com({ consumoTotalKwh: 100, geracaoTotalKwh: 95 }));
    expect(r.energiaCompensadaKwh).toBe(85.37);
    expect(r.contaComSolar).toBe(30);
    expect(r.contaSemSolar).toBe(100);
    expect(r.economiaMensal).toBe(70);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(9.63);
  });
});

describe("fio-b-hipotese - fronteiras de energia", () => {
  it("consumo < custo de disponibilidade: conta = piso, K = 0", () => {
    const r = ok(com({ consumoTotalKwh: 20, geracaoTotalKwh: 100 }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaComSolar).toBe(30);
    expect(r.contaSemSolar).toBe(20);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(100);
  });

  it("geracao zero: K=0, com solar = sem solar, economia 0", () => {
    const r = ok(com({ geracaoTotalKwh: 0 }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(0);
    expect(r.contaComSolar).toBe(500);
    expect(r.contaSemSolar).toBe(500);
    expect(r.economiaMensal).toBe(0);
  });

  it("geracao menor que o consumo (E=200): K=200, conta 300 + 200*0,18 = 336", () => {
    const r = ok(com({ geracaoTotalKwh: 200 }));
    expect(r.energiaCompensadaKwh).toBe(200);
    expect(r.contaComSolar).toBe(336);
  });

  it("geracao igual ao consumo (E=C=500): K=500, conta 90", () => {
    const r = ok(com({ geracaoTotalKwh: 500 }));
    expect(r.energiaCompensadaKwh).toBe(500);
    expect(r.contaComSolar).toBe(90);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(0);
  });

  it("geracao maior que o consumo: K limitado a C; sobra identificada", () => {
    const r = ok(com({ geracaoTotalKwh: 900 }));
    expect(r.energiaCompensadaKwh).toBe(500);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(400);
  });

  it("varredura: 0 <= K <= min(C,E), K + (E-K) = E, conta >= piso, economia >= 0", () => {
    for (const c of [0, 10, 30, 31, 100, 500, 1000]) {
      for (const e of [0, 1, 50, 100, 500, 2000]) {
        const r = ok(com({ consumoTotalKwh: c, geracaoTotalKwh: e }));
        expect(r.energiaCompensadaKwh).toBeGreaterThanOrEqual(0);
        expect(r.energiaCompensadaKwh).toBeLessThanOrEqual(Math.min(c, e));
        expect(r.energiaCompensadaKwh + r.energiaDisponivelNaoCompensadaKwh).toBeCloseTo(e, 2);
        expect(r.contaComSolar).toBeGreaterThanOrEqual(30);
        expect(r.economiaMensal).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("fio-b-hipotese - distincao das energias", () => {
  it("total / autoconsumo instantaneo (0 por premissa) / injetada / disponivel / compensada / nao compensada", () => {
    const r = ok(base);
    expect(r.geracaoTotalKwh).toBe(600);
    expect(r.autoconsumoInstantaneoKwh).toBe(0);
    expect(r.premissas).toEqual({ autoconsumoInstantaneo: "zero_conservador", bancoDeCreditos: false });
    expect(r.energiaInjetadaKwh).toBe(600);
    expect(r.energiaDisponivelCompensacaoKwh).toBe(600);
    expect(r.energiaCompensadaKwh).toBe(500);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(100);
    expect(r.consumoDaRedeKwh).toBe(500);
  });

  it("autoconsumo informado reduz C e E e muda a premissa", () => {
    const r = ok(com({ autoconsumoInstantaneoKwh: 100 }));
    expect(r.premissas.autoconsumoInstantaneo).toBe("informado");
    expect(r.consumoDaRedeKwh).toBe(400);
    expect(r.energiaInjetadaKwh).toBe(500);
    expect(r.geracaoTotalKwh).toBe(600);
    expect(r.autoconsumoInstantaneoKwh).toBe(100);
    // C=400, E=500, D=30: K = min(500, 400, 370/0,82 = 451,2) = 400
    expect(r.energiaCompensadaKwh).toBe(400);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(100);
    expect(r.contaSemSolar).toBe(400);
    expect(r.contaComSolar).toBe(72);
  });

  it("autoconsumo acima do consumo ou da geracao => erro", () => {
    expect(calcularFioBHipotese(com({ autoconsumoInstantaneoKwh: 501 })).ok).toBe(false);
    expect(calcularFioBHipotese(com({ geracaoTotalKwh: 50, autoconsumoInstantaneoKwh: 60 })).ok).toBe(false);
  });

  it("autoconsumo negativo => erro", () => {
    expect(calcularFioBHipotese(com({ autoconsumoInstantaneoKwh: -1 })).ok).toBe(false);
  });
});

describe("fio-b-hipotese - N = T e N > T (erro explicito, sem divisao por zero)", () => {
  it("N == T => erro com motivo, sem campos de resultado", () => {
    const r = calcularFioBHipotese(com({ custoEnergiaCompensadaRsKwh: 1 }));
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("contaComSolar");
    if (!r.ok) expect(r.motivo.length).toBeGreaterThan(0);
  });

  it("N > T => erro", () => {
    expect(calcularFioBHipotese(com({ custoEnergiaCompensadaRsKwh: 1.5 })).ok).toBe(false);
  });

  it("N == T com C <= D (onde a divisao seria 0/0) tambem e erro", () => {
    expect(
      calcularFioBHipotese(com({ consumoTotalKwh: 10, custoEnergiaCompensadaRsKwh: 1 })).ok,
    ).toBe(false);
  });

  it("N = 0 e valido (T > N >= 0): conta = piso D*T", () => {
    const r = ok(com({ custoEnergiaCompensadaRsKwh: 0 }));
    expect(r.contaComSolar).toBe(30);
  });
});

describe("fio-b-hipotese - entradas ausentes ou invalidas", () => {
  const campos: (keyof EntradaFioBHipotese)[] = [
    "consumoTotalKwh",
    "geracaoTotalKwh",
    "tarifaCheiaRsKwh",
    "custoDisponibilidadeKwh",
    "custoEnergiaCompensadaRsKwh",
  ];
  const invalido = (campo: keyof EntradaFioBHipotese, v: unknown) =>
    calcularFioBHipotese({ ...base, [campo]: v } as EntradaFioBHipotese);

  it.each(campos)("%s ausente (null/undefined) => erro, nunca zero", (campo) => {
    expect(invalido(campo, null).ok).toBe(false);
    expect(invalido(campo, undefined).ok).toBe(false);
  });
  it.each(campos)("%s NaN => erro", (campo) => {
    expect(invalido(campo, Number.NaN).ok).toBe(false);
  });
  it.each(campos)("%s Infinity e -Infinity => erro", (campo) => {
    expect(invalido(campo, Infinity).ok).toBe(false);
    expect(invalido(campo, -Infinity).ok).toBe(false);
  });
  it.each(campos)("%s negativo => erro", (campo) => {
    expect(invalido(campo, -1).ok).toBe(false);
  });
  it("tarifa zero => erro (T > N >= 0)", () => {
    expect(calcularFioBHipotese(com({ tarifaCheiaRsKwh: 0 })).ok).toBe(false);
  });
  it("valor em texto => erro", () => {
    expect(invalido("consumoTotalKwh", "500").ok).toBe(false);
  });
});

describe("fio-b-hipotese - arredondamento e reproducao", () => {
  const casos: EntradaFioBHipotese[] = [
    base,
    com({ geracaoTotalKwh: 490 }),
    com({ consumoTotalKwh: 100, geracaoTotalKwh: 95 }),
    com({ consumoTotalKwh: 333, geracaoTotalKwh: 217, tarifaCheiaRsKwh: 0.987, custoEnergiaCompensadaRsKwh: 0.1278 }),
    com({ consumoTotalKwh: 333.333, geracaoTotalKwh: 301.777, tarifaCheiaRsKwh: 0.9137, custoEnergiaCompensadaRsKwh: 0.1999 }),
  ];
  const duasCasas = (v: number) => Number(v.toFixed(2)) === v;

  it.each(casos.map((c, i) => [i, c] as const))("caso %s: monetarios e energias em 2 casas", (_i, e) => {
    const r = ok(e);
    for (const v of [
      r.contaComSolar,
      r.contaSemSolar,
      r.economiaMensal,
      r.energiaCompensadaKwh,
      r.energiaDisponivelNaoCompensadaKwh,
      r.energiaInjetadaKwh,
      r.consumoDaRedeKwh,
    ]) {
      expect(duasCasas(v)).toBe(true);
    }
  });

  it.each(casos.map((c, i) => [i, c] as const))("caso %s: reproducao apos persistencia", (_i, e) => {
    const original = ok(e);
    const gravado = JSON.parse(JSON.stringify(original));
    expect(gravado).toEqual(original);
    expect(ok(JSON.parse(JSON.stringify(e)))).toEqual(original);
    for (const k of ["contaComSolar", "contaSemSolar", "economiaMensal"] as const) {
      expect(Math.round(gravado[k] * 100) / 100).toBe(gravado[k]);
    }
  });

  it("economia = sem solar - com solar, coerente com os valores arredondados", () => {
    for (const e of casos) {
      const r = ok(e);
      expect(r.economiaMensal).toBeCloseTo(r.contaSemSolar - r.contaComSolar, 2);
    }
  });

  it("meio centavo arredonda para longe de zero, sem ruido binario (1,005 => 1,01)", () => {
    // sem solar = C*T = 1*1,005 = 1,005
    const r = ok({
      consumoTotalKwh: 1,
      geracaoTotalKwh: 0,
      tarifaCheiaRsKwh: 1.005,
      custoDisponibilidadeKwh: 0,
      custoEnergiaCompensadaRsKwh: 0.5,
    });
    expect(r.contaSemSolar).toBe(1.01);
  });
});

describe("fio-b-hipotese - pureza", () => {
  it("nao altera a entrada (objeto congelado e comparacao com copia)", () => {
    const e = Object.freeze({ ...base });
    const copia = structuredClone(base);
    expect(() => calcularFioBHipotese(e)).not.toThrow();
    expect(e).toEqual(copia);
  });

  it("duas chamadas iguais dao o mesmo resultado (sucesso e erro)", () => {
    expect(calcularFioBHipotese(base)).toEqual(calcularFioBHipotese(base));
    const err = com({ custoEnergiaCompensadaRsKwh: 1 });
    expect(calcularFioBHipotese(err)).toEqual(calcularFioBHipotese(err));
  });
});

describe("fio-b-hipotese - enquadramentos fora do recorte (GD II) nao sao suportados", () => {
  const entradaCompleta = (gd: string) => ({
    enquadramento: { ...RECORTE_P0, gd },
    tarifaBaseRsKwh: 0.999, // FICTICIO
    tarifaBaseBaseTributaria: "com_tributos" as const,
    consumoMedioKwh: 321,
    consumoOrigem: "informado" as const,
    tarifaEfetivaContaRsKwh: null,
    parametrosFioB: {
      fioBRsKwh: 0.111,
      baseTributaria: "com_tributos" as const,
      origem: "manual_justificado" as const,
      distribuidora: "Distribuidora FICTICIA",
      fonte: "Fonte FICTICIA",
      vigenciaInicio: "2026-03-01",
      vigenciaFim: "2026-09-30",
      justificativa: "Justificativa FICTICIA",
    },
    dataReferencia: "2026-06-15",
  });

  it("GD II (recorte) completa", () => {
    expect(avaliarCompletude(entradaCompleta("GD_II"))).toEqual({ completa: true });
  });

  it.each(["GD_I", "GD_III", "GD_IV", "GD_X"])("%s => nao suportado e incompleta", (gd) => {
    const r = avaliarCompletude(entradaCompleta(gd));
    expect(r.completa).toBe(false);
    if (!r.completa) {
      const c = r.pendencias.map((p) => p.codigo);
      expect(c).toContain("enquadramento_nao_suportado");
      expect(c).toContain("percentual_legal_indisponivel");
    }
  });
});
