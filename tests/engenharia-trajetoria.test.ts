import { describe, expect, it } from "vitest";
import { concluidasNoMes, lerMetrica, lerTrajetoria, mesAnterior, mesPorExtenso, resumirTrajetoria, type MesTrajetoria } from "@/lib/engenharia-trajetoria";

const MESES: MesTrajetoria[] = [
  { mes: "2026-08", obras: 2, kwp: 20 },
  { mes: "2026-10", obras: 3, kwp: 31.5 },
  { mes: "2026-11", obras: 4, kwp: 40 },
];

describe("lerTrajetoria", () => {
  it("lê o pessoal e a equipe; meses inválidos ficam de fora", () => {
    const t = lerTrajetoria({
      pessoal: [{ mes: "2026-10", obras: "3", kwp: "31.50" }, { mes: "2026-13", obras: 1, kwp: 1 }, { mes: null }],
      equipe: { meses: [{ mes: "2026-11", obras: 4, kwp: 40 }], pessoas: [{ membro_id: "m1", nome: "Ana", obras: 2, kwp: 18.4 }] },
    });
    expect(t.pessoal).toEqual([{ mes: "2026-10", obras: 3, kwp: 31.5 }]);
    expect(t.equipe).toEqual({ meses: [{ mes: "2026-11", obras: 4, kwp: 40 }], pessoas: [{ membroId: "m1", nome: "Ana", obras: 2, kwp: 18.4 }] });
  });

  it("sem equipe (quem não coordena) e com resposta vazia", () => {
    expect(lerTrajetoria({ pessoal: [], equipe: null })).toEqual({ pessoal: [], equipe: null });
    expect(lerTrajetoria(null)).toEqual({ pessoal: [], equipe: null });
  });

  it("métrica: kWp ou, por padrão, obras", () => {
    expect(lerMetrica("kwp")).toBe("kwp");
    expect(lerMetrica("x")).toBe("obras");
    expect(lerMetrica(undefined)).toBe("obras");
  });
});

describe("resumirTrajetoria", () => {
  it("totais, mês atual, média e o mês da primeira obra", () => {
    const r = resumirTrajetoria(MESES, "obras", "2026-11");
    expect(r).toMatchObject({ totalObras: 9, totalKwp: 91.5, obrasNoMes: 4, kwpNoMes: 40, desde: "2026-08" });
    expect(r.mediaKwp).toBeCloseTo(10.17, 2);
  });

  it("trimestres do primeiro até o atual (\"Hoje\"), com acumulado e no trecho", () => {
    const r = resumirTrajetoria(MESES, "obras", "2026-11");
    expect(r.trimestres).toEqual([
      { rotulo: "T3 26", acumulado: 2, noTrecho: 2 },
      { rotulo: "Hoje", acumulado: 9, noTrecho: 7 },
    ]);
    expect(r.mediaAnteriores).toBe(2);
  });

  it("trimestre sem obra no meio entra com zero", () => {
    const r = resumirTrajetoria([{ mes: "2026-01", obras: 1, kwp: 5 }, { mes: "2026-10", obras: 1, kwp: 5 }], "kwp", "2026-10");
    expect(r.trimestres.map((t) => [t.rotulo, t.noTrecho, t.acumulado])).toEqual([
      ["T1 26", 5, 5],
      ["T2 26", 0, 5],
      ["T3 26", 0, 5],
      ["Hoje", 5, 10],
    ]);
  });

  it("mostra só os 12 últimos trimestres, com o acumulado de todos", () => {
    const r = resumirTrajetoria([{ mes: "2020-01", obras: 5, kwp: 50 }, { mes: "2026-11", obras: 1, kwp: 10 }], "obras", "2026-11");
    expect(r.trimestres).toHaveLength(12);
    expect(r.trimestres[0].acumulado).toBe(5);
    expect(r.trimestres.at(-1)).toEqual({ rotulo: "Hoje", acumulado: 6, noTrecho: 1 });
  });

  it("próximo marco: a cada 25 obras ou 250 kWp; quem bate o marco já mira o seguinte", () => {
    expect(resumirTrajetoria(MESES, "obras", "2026-11").marco).toEqual({ proximo: 25, falta: 16, progresso: 9 / 25 });
    expect(resumirTrajetoria(MESES, "kwp", "2026-11").marco).toMatchObject({ proximo: 250, falta: 158.5 });
    expect(resumirTrajetoria([{ mes: "2026-11", obras: 25, kwp: 250 }], "obras", "2026-11").marco).toMatchObject({ proximo: 50, falta: 25 });
  });

  it("sem obras concluídas: zeros, sem média e sem trimestres", () => {
    const r = resumirTrajetoria([], "obras", "2026-11");
    expect(r).toMatchObject({ totalObras: 0, mediaKwp: null, desde: null, trimestres: [], mediaAnteriores: null });
    expect(r.marco).toEqual({ proximo: 25, falta: 25, progresso: 0 });
  });

  it("ignora meses depois do atual", () => {
    expect(resumirTrajetoria(MESES, "obras", "2026-10").totalObras).toBe(5);
  });
});

describe("mês a mês", () => {
  it("mês anterior, inclusive na virada do ano", () => {
    expect(mesAnterior("2026-11")).toBe("2026-10");
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });

  it("concluídas no mês, comparadas com o anterior", () => {
    expect(concluidasNoMes(MESES, "2026-11")).toEqual({ atual: 4, comparacao: "▲ 1 em relação a outubro" });
    expect(concluidasNoMes(MESES, "2026-10")).toEqual({ atual: 3, comparacao: "▲ 3 em relação a setembro" });
    expect(concluidasNoMes(MESES, "2026-12")).toEqual({ atual: 0, comparacao: "▼ 4 em relação a novembro" });
    expect(concluidasNoMes([], "2026-11")).toEqual({ atual: 0, comparacao: "igual a outubro" });
  });

  it("mês por extenso", () => {
    expect(mesPorExtenso("2024-03")).toBe("março de 2024");
  });
});
