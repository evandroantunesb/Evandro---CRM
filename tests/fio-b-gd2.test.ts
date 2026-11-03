// Testes PUROS da formula aceita do Fio B (GD II com piso do art. 655-I, sem
// banco de creditos). Todos os dados sao FICTICIOS; nada aqui e tarifa ou Fio B
// oficial. Nao e o motor da calculadora.
//
// Formula:  K = min(E, C, max(0, ((C - D) * T) / (T - N)))
//   com solar = max(D*T, (C - K)*T + K*N);  sem solar = max(consumo total, D)*T
//   (sem solar nao ha autoconsumo: a conta sem solar usa o consumo TOTAL)
//   economia = arred2(arred2(sem) - arred2(com)); paybackDisponivel = economia > 0
//   N = custo da energia compensada (Fio B * 0,60, ja resolvido pelo chamador
//   na base tributaria de T). Exige T > N >= 0.
import { describe, expect, it } from "vitest";
import {
  METODO_GD2_PISO_V1,
  calcularFioBGd2,
  type EntradaFioBGd2,
} from "@/lib/fio-b-gd2";

// FICTICIO: T=1,00; Fio B=0,30 => N=0,18; D=30.
const base: EntradaFioBGd2 = {
  consumoTotalKwh: 500,
  geracaoTotalKwh: 600,
  tarifaCheiaRsKwh: 1.0,
  custoDisponibilidadeKwh: 30,
  custoEnergiaCompensadaRsKwh: 0.18,
};
const com = (o: Partial<EntradaFioBGd2>): EntradaFioBGd2 => ({ ...base, ...o });

function ok(e: EntradaFioBGd2) {
  const r = calcularFioBGd2(e);
  if (!r.ok) throw new Error(`esperava sucesso, veio erro: ${r.motivo}`);
  return r;
}

describe("fio-b-gd2 (FICTICIO) - exemplos de referencia", () => {
  it("C=500, E=600 => K=500, com solar 90,00, sem solar 500,00", () => {
    const r = ok(base);
    expect(r.metodo).toBe(METODO_GD2_PISO_V1);
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

describe("fio-b-gd2 - fronteiras de energia", () => {
  it("consumo < custo de disponibilidade: conta = piso, K = 0", () => {
    const r = ok(com({ consumoTotalKwh: 20, geracaoTotalKwh: 100 }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaComSolar).toBe(30);
    // C=20 < D=30: sem solar = max(20, 30) * 1 = 30 (piso), nao C*T = 20
    expect(r.contaSemSolar).toBe(30);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
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

describe("fio-b-gd2 - distincao das energias", () => {
  it("total / autoconsumo instantaneo (0 por premissa) / injetada / disponivel / compensada / nao compensada", () => {
    const r = ok(base);
    expect(r.geracaoTotalKwh).toBe(600);
    expect(r.autoconsumoInstantaneoKwh).toBe(0);
    expect(r.premissas).toEqual({ autoconsumoInstantaneo: "zero_declarado", bancoDeCreditos: false });
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
    // sem solar usa o consumo TOTAL (500), nao o consumo da rede (400)
    expect(r.contaSemSolar).toBe(500);
    expect(r.contaComSolar).toBe(72);
    expect(r.economiaMensal).toBe(428);
  });

  it("autoconsumo acima do consumo ou da geracao => erro", () => {
    expect(calcularFioBGd2(com({ autoconsumoInstantaneoKwh: 501 })).ok).toBe(false);
    expect(calcularFioBGd2(com({ geracaoTotalKwh: 50, autoconsumoInstantaneoKwh: 60 })).ok).toBe(false);
  });

  it("autoconsumo negativo => erro", () => {
    expect(calcularFioBGd2(com({ autoconsumoInstantaneoKwh: -1 })).ok).toBe(false);
  });
});

describe("fio-b-gd2 - N = T e N > T (erro explicito, sem divisao por zero)", () => {
  it("N == T => erro com motivo, sem campos de resultado", () => {
    const r = calcularFioBGd2(com({ custoEnergiaCompensadaRsKwh: 1 }));
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("contaComSolar");
    if (!r.ok) expect(r.motivo.length).toBeGreaterThan(0);
  });

  it("N > T => erro", () => {
    expect(calcularFioBGd2(com({ custoEnergiaCompensadaRsKwh: 1.5 })).ok).toBe(false);
  });

  it("N == T com C <= D (onde a divisao seria 0/0) tambem e erro", () => {
    expect(
      calcularFioBGd2(com({ consumoTotalKwh: 10, custoEnergiaCompensadaRsKwh: 1 })).ok,
    ).toBe(false);
  });

  it("N = 0 e valido (T > N >= 0): conta = piso D*T", () => {
    const r = ok(com({ custoEnergiaCompensadaRsKwh: 0 }));
    expect(r.contaComSolar).toBe(30);
  });
});

describe("fio-b-gd2 - entradas ausentes ou invalidas", () => {
  const campos: (keyof EntradaFioBGd2)[] = [
    "consumoTotalKwh",
    "geracaoTotalKwh",
    "tarifaCheiaRsKwh",
    "custoDisponibilidadeKwh",
    "custoEnergiaCompensadaRsKwh",
  ];
  const invalido = (campo: keyof EntradaFioBGd2, v: unknown) =>
    calcularFioBGd2({ ...base, [campo]: v } as EntradaFioBGd2);

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
    expect(calcularFioBGd2(com({ tarifaCheiaRsKwh: 0 })).ok).toBe(false);
  });
  it("valor em texto => erro", () => {
    expect(invalido("consumoTotalKwh", "500").ok).toBe(false);
  });
});

describe("fio-b-gd2 - arredondamento e reproducao", () => {
  const casos: EntradaFioBGd2[] = [
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

// Valores esperados derivados a mao (T=1,00; N=0,18; D=30; sem solar = max(consumo total,D)*T, aqui C = consumo total pois autoconsumo 0;
// com solar = max(D*T, (C-K)*T + K*N); K = min(E, C, max(0, (C-D)*T/(T-N)))).
describe("fio-b-gd2 - consumo abaixo, igual e acima do piso (C<D, C=D, C>D)", () => {
  it.each([0, 100])("C=20 < D=30, E=%s: K=0; sem = max(20,30)*1 = 30; com = max(30, 20) = 30; economia 0", (e) => {
    const r = ok(com({ consumoTotalKwh: 20, geracaoTotalKwh: e }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaSemSolar).toBe(30);
    expect(r.contaComSolar).toBe(30);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
  });

  it.each([0, 100])("C=30 = D, E=%s: (C-D)=0 => K=0; sem = 30; com = max(30, 30) = 30; economia 0", (e) => {
    const r = ok(com({ consumoTotalKwh: 30, geracaoTotalKwh: e }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaSemSolar).toBe(30);
    expect(r.contaComSolar).toBe(30);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
  });

  it("C=100 > D, E=0: K=0; sem = 100; com = max(30, 100) = 100; economia 0, payback indisponivel", () => {
    const r = ok(com({ consumoTotalKwh: 100, geracaoTotalKwh: 0 }));
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaSemSolar).toBe(100);
    expect(r.contaComSolar).toBe(100);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
  });

  it("C=100 > D, E=50: K=min(50,100,70/0,82=85,37)=50; com = 50 + 50*0,18 = 59; sem = 100; economia 41", () => {
    const r = ok(com({ consumoTotalKwh: 100, geracaoTotalKwh: 50 }));
    expect(r.energiaCompensadaKwh).toBe(50);
    expect(r.contaComSolar).toBe(59);
    expect(r.contaSemSolar).toBe(100);
    expect(r.economiaMensal).toBe(41);
    expect(r.paybackDisponivel).toBe(true);
  });

  it("C<=D com qualquer geracao: contas coincidem em D*T, economia 0, payback indisponivel", () => {
    for (const c of [0, 1, 20, 29.99, 30]) {
      for (const e of [0, 1, 30, 1000]) {
        const r = ok(com({ consumoTotalKwh: c, geracaoTotalKwh: e }));
        expect(r.contaSemSolar).toBe(30);
        expect(r.contaComSolar).toBe(30);
        expect(r.economiaMensal).toBe(0);
        expect(r.paybackDisponivel).toBe(false);
      }
    }
  });
});

describe("fio-b-gd2 - limites da compensacao K", () => {
  it("K=0 quando C<=D (C=30 e C=10, geracao sobrando)", () => {
    expect(ok(com({ consumoTotalKwh: 30, geracaoTotalKwh: 999 })).energiaCompensadaKwh).toBe(0);
    expect(ok(com({ consumoTotalKwh: 10, geracaoTotalKwh: 999 })).energiaCompensadaKwh).toBe(0);
  });

  it("K=E quando E pequeno: C=500, E=10 => K=10; com = 490 + 1,8 = 491,8; sem = 500; economia 8,2", () => {
    const r = ok(com({ geracaoTotalKwh: 10 }));
    expect(r.energiaCompensadaKwh).toBe(10);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(0);
    expect(r.contaComSolar).toBe(491.8);
    expect(r.economiaMensal).toBe(8.2);
    expect(r.paybackDisponivel).toBe(true);
  });

  it("K=C quando E grande e C >= D*T/N (166,67): C=200, E=300 => K=200 (limite 170/0,82=207,32); com = 36; sem = 200; economia 164", () => {
    const r = ok(com({ consumoTotalKwh: 200, geracaoTotalKwh: 300 }));
    expect(r.energiaCompensadaKwh).toBe(200);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(100);
    expect(r.contaComSolar).toBe(36);
    expect(r.contaSemSolar).toBe(200);
    expect(r.economiaMensal).toBe(164);
  });

  it("K limitado pelo piso quando E grande e C < D*T/N: C=100, E=500 => K=85,37; com = piso 30", () => {
    const r = ok(com({ consumoTotalKwh: 100, geracaoTotalKwh: 500 }));
    expect(r.energiaCompensadaKwh).toBe(85.37);
    expect(r.contaComSolar).toBe(30);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(414.63);
  });

  // Exato em binario: T=1; N=0,5; D=20; C=30 => K_limite = (30-20)*1/(1-0,5) = 20.
  const exato = (e: number) =>
    ok({ consumoTotalKwh: 30, geracaoTotalKwh: e, tarifaCheiaRsKwh: 1, custoDisponibilidadeKwh: 20, custoEnergiaCompensadaRsKwh: 0.5 });

  it("E = K_limite exato (20): K=20; com = 10 + 10 = 20 = D*T; sem = 30; economia 10", () => {
    const r = exato(20);
    expect(r.energiaCompensadaKwh).toBe(20);
    expect(r.contaComSolar).toBe(20);
    expect(r.contaSemSolar).toBe(30);
    expect(r.economiaMensal).toBe(10);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(0);
  });

  it("E logo abaixo (19): K=19; com = 11 + 9,5 = 20,5 (acima do piso)", () => {
    const r = exato(19);
    expect(r.energiaCompensadaKwh).toBe(19);
    expect(r.contaComSolar).toBe(20.5);
    expect(r.economiaMensal).toBe(9.5);
  });

  it("E logo acima (21): K continua 20; com = 20 (piso); sobra 1", () => {
    const r = exato(21);
    expect(r.energiaCompensadaKwh).toBe(20);
    expect(r.contaComSolar).toBe(20);
    expect(r.energiaDisponivelNaoCompensadaKwh).toBe(1);
    expect(r.economiaMensal).toBe(10);
  });

  it("C = D*T/N exato (T=1, N=0,5, D=20, C=40): K_limite = 20/0,5 = 40 = C; E=40 => K=40; com = 20; sem = 40; economia 20", () => {
    const r = ok({ consumoTotalKwh: 40, geracaoTotalKwh: 40, tarifaCheiaRsKwh: 1, custoDisponibilidadeKwh: 20, custoEnergiaCompensadaRsKwh: 0.5 });
    expect(r.energiaCompensadaKwh).toBe(40);
    expect(r.contaComSolar).toBe(20);
    expect(r.contaSemSolar).toBe(40);
    expect(r.economiaMensal).toBe(20);
  });
});

describe("fio-b-gd2 - autoconsumo informado desloca C e E", () => {
  it("consumo 120, geracao 200, autoconsumo 100 => C=20 < D, E=100: K=0; sem = 120 (consumo total); com = 30; economia 90", () => {
    const r = ok(com({ consumoTotalKwh: 120, geracaoTotalKwh: 200, autoconsumoInstantaneoKwh: 100 }));
    expect(r.consumoDaRedeKwh).toBe(20);
    expect(r.energiaDisponivelCompensacaoKwh).toBe(100);
    expect(r.energiaCompensadaKwh).toBe(0);
    expect(r.contaSemSolar).toBe(120);
    expect(r.contaComSolar).toBe(30);
    expect(r.economiaMensal).toBe(90);
    expect(r.paybackDisponivel).toBe(true);
  });

  it("consumo 200, geracao 150, autoconsumo 50 => C=150, E=100: K=min(100,150,120/0,82=146,34)=100; com = 50 + 18 = 68; sem = 200 (consumo total); economia 132", () => {
    const r = ok(com({ consumoTotalKwh: 200, geracaoTotalKwh: 150, autoconsumoInstantaneoKwh: 50 }));
    expect(r.consumoDaRedeKwh).toBe(150);
    expect(r.energiaDisponivelCompensacaoKwh).toBe(100);
    expect(r.energiaCompensadaKwh).toBe(100);
    expect(r.contaSemSolar).toBe(200);
    expect(r.contaComSolar).toBe(68);
    expect(r.economiaMensal).toBe(132);
    expect(r.paybackDisponivel).toBe(true);
  });

  it("regressao: a conta sem solar nao depende do autoconsumo nem da geracao (usa o consumo total)", () => {
    for (const c of [0, 20, 30, 120, 500]) {
      const referencia = ok(com({ consumoTotalKwh: c, geracaoTotalKwh: 0 })).contaSemSolar;
      expect(referencia).toBe(Math.max(c, 30));
      for (const g of [0, 50, 600]) {
        for (const a of [0, 5, 20, 100]) {
          if (a > c || a > g) continue;
          expect(ok(com({ consumoTotalKwh: c, geracaoTotalKwh: g, autoconsumoInstantaneoKwh: a })).contaSemSolar).toBe(referencia);
        }
      }
    }
  });

  it("regressao: autoconsumo que leva o consumo da rede abaixo do piso ainda gera economia (consumo total > D)", () => {
    // consumo 40, autoconsumo 20, geracao 20 => C=20 < D=30, E=0; sem = 40; com = max(30, 20) = 30; economia 10
    const r = ok(com({ consumoTotalKwh: 40, geracaoTotalKwh: 20, autoconsumoInstantaneoKwh: 20 }));
    expect(r.consumoDaRedeKwh).toBe(20);
    expect(r.contaSemSolar).toBe(40);
    expect(r.contaComSolar).toBe(30);
    expect(r.economiaMensal).toBe(10);
    expect(r.paybackDisponivel).toBe(true);
  });
});

describe("fio-b-gd2 - arredondamento das contas e economia que fecha", () => {
  // T=1; N=0,5; D=20; C=20,004; E=1 => K_limite = 0,004/0,5 = 0,008; K=0,008;
  // com = max(20, 19,996 + 0,004 = 20,000) = 20; sem = 20,004. Diferenca real 0,004 < 0,005.
  it("contas reais diferem 0,004 mas arredondam iguais (20,00): economia 0, payback indisponivel", () => {
    const r = ok({ consumoTotalKwh: 20.004, geracaoTotalKwh: 1, tarifaCheiaRsKwh: 1, custoDisponibilidadeKwh: 20, custoEnergiaCompensadaRsKwh: 0.5 });
    expect(r.contaSemSolar).toBe(20);
    expect(r.contaComSolar).toBe(20);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
  });

  // T=1; N=0,5; D=0,996; C=1,004; E=1 => K_limite = 0,008/0,5 = 0,016; com = max(0,996, 0,988 + 0,008 = 0,996) = 0,996 -> 1,00;
  // sem = 1,004 -> 1,00. Diferenca real 0,008 (arredondaria para 0,01 se calculada sobre os reais); exibido: 1,00 - 1,00 = 0.
  it("diferenca real 0,008 mas exibidos 1,00 e 1,00: economia 0 (os numeros exibidos fecham)", () => {
    const r = ok({ consumoTotalKwh: 1.004, geracaoTotalKwh: 1, tarifaCheiaRsKwh: 1, custoDisponibilidadeKwh: 0.996, custoEnergiaCompensadaRsKwh: 0.5 });
    expect(r.contaSemSolar).toBe(1);
    expect(r.contaComSolar).toBe(1);
    expect(r.economiaMensal).toBe(0);
    expect(r.paybackDisponivel).toBe(false);
  });

  // C=1,006 => sem 1,006 -> 1,01; com = 0,996 -> 1,00; economia exibida 0,01.
  it("exibidos 1,01 e 1,00: economia 0,01 e payback disponivel", () => {
    const r = ok({ consumoTotalKwh: 1.006, geracaoTotalKwh: 1, tarifaCheiaRsKwh: 1, custoDisponibilidadeKwh: 0.996, custoEnergiaCompensadaRsKwh: 0.5 });
    expect(r.contaSemSolar).toBe(1.01);
    expect(r.contaComSolar).toBe(1);
    expect(r.economiaMensal).toBe(0.01);
    expect(r.paybackDisponivel).toBe(true);
  });
});

describe("fio-b-gd2 - invariantes da varredura", () => {
  const consumos = [0, 10, 20, 30, 31, 100, 166, 167, 200, 500, 1000];
  const geracoes = [0, 1, 10, 50, 100, 500, 2000];
  const autos = [0, 5, 20];

  it("sem >= com; sem >= D*T; economia = sem - com exibidos; payback so com economia > 0", () => {
    for (const c of consumos) {
      for (const e of geracoes) {
        for (const a of autos) {
          if (a > c || a > e) continue;
          const r = ok(com({ consumoTotalKwh: c, geracaoTotalKwh: e, autoconsumoInstantaneoKwh: a }));
          expect(r.contaSemSolar).toBeGreaterThanOrEqual(r.contaComSolar);
          expect(r.contaSemSolar).toBeGreaterThanOrEqual(30);
          expect(r.contaComSolar).toBeGreaterThanOrEqual(30);
          expect(Math.abs(r.economiaMensal - (r.contaSemSolar - r.contaComSolar))).toBeLessThan(1e-9);
          expect(r.paybackDisponivel).toBe(r.economiaMensal > 0);
        }
      }
    }
  });

  it("determinismo: mesma entrada em varias chamadas => resultado identico", () => {
    for (const c of [20, 30, 100, 500]) {
      const e = com({ consumoTotalKwh: c, geracaoTotalKwh: 77, autoconsumoInstantaneoKwh: 10 });
      const a = ok(e);
      expect(ok(e)).toEqual(a);
      expect(ok({ ...e })).toEqual(a);
    }
  });
});

describe("fio-b-gd2 - pureza", () => {
  it("nao altera a entrada (objeto congelado e comparacao com copia)", () => {
    const e = Object.freeze({ ...base });
    const copia = structuredClone(base);
    expect(() => calcularFioBGd2(e)).not.toThrow();
    expect(e).toEqual(copia);
  });

  it("duas chamadas iguais dao o mesmo resultado (sucesso e erro)", () => {
    expect(calcularFioBGd2(base)).toEqual(calcularFioBGd2(base));
    const err = com({ custoEnergiaCompensadaRsKwh: 1 });
    expect(calcularFioBGd2(err)).toEqual(calcularFioBGd2(err));
  });
});
