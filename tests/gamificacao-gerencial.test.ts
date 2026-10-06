import { describe, expect, it } from "vitest";
import {
  PERFIS_RANKING_GERENCIAL,
  calcularEscopoGestor,
  construirRankingCompleto,
  contarParticipantes,
  filtrarPorEscopo,
  somarXp,
  variacaoPercentual,
} from "@/lib/gamificacao-gerencial";

const linhas = [
  { membro_id: "a", total_xp: 300 },
  { membro_id: "b", total_xp: 120 },
  { membro_id: "c", total_xp: 0 },
  { membro_id: "d", total_xp: 80 },
  { membro_id: "e", total_xp: 50 },
  { membro_id: "f", total_xp: 40 },
  { membro_id: "g", total_xp: 10 },
];

describe("gamificação gerencial — funções puras", () => {
  it("perfis do ranking: closer e sdr", () => {
    expect([...PERFIS_RANKING_GERENCIAL]).toEqual(["closer", "sdr"]);
  });

  it("filtrarPorEscopo: nulo (admin) mantém tudo; Set (gestor) filtra", () => {
    expect(filtrarPorEscopo(linhas, null)).toHaveLength(7);
    expect(filtrarPorEscopo(linhas, new Set(["a", "d"])).map((l) => l.membro_id)).toEqual(["a", "d"]);
    expect(filtrarPorEscopo(null, null)).toEqual([]);
  });

  it("somarXp soma as linhas completas, não só o top 5", () => {
    expect(somarXp(linhas)).toBe(600);
    const top5 = construirRankingCompleto(
      linhas,
      new Map(linhas.map((l) => [l.membro_id, l.membro_id.toUpperCase()])),
    ).slice(0, 5);
    expect(top5.reduce((s, r) => s + r.total, 0)).toBe(590);
  });

  it("contarParticipantes: total > 0 e sem duplicar membro entre perfis", () => {
    const closer = [
      { membro_id: "a", total_xp: 10 },
      { membro_id: "b", total_xp: 0 },
    ];
    const sdr = [
      { membro_id: "a", total_xp: 5 },
      { membro_id: "c", total_xp: 7 },
    ];
    expect(contarParticipantes([closer, sdr])).toBe(2);
  });

  it("variacaoPercentual: sem baseline retorna null", () => {
    expect(variacaoPercentual(100, 0)).toBeNull();
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(50, 100)).toBe(-50);
  });

  it("construirRankingCompleto: ordena, numera e ignora membro sem nome", () => {
    const r = construirRankingCompleto(
      [
        { membro_id: "x", total_xp: 5 },
        { membro_id: "y", total_xp: 9 },
        { membro_id: "z", total_xp: 99 },
      ],
      new Map([
        ["x", "Xavier"],
        ["y", "Yara"],
      ]),
    );
    expect(r).toEqual([
      { posicao: 1, membroId: "y", nome: "Yara", total: 9 },
      { posicao: 2, membroId: "x", nome: "Xavier", total: 5 },
    ]);
  });

  it("calcularEscopoGestor: só equipes (ativas, já filtradas) onde ele é e_gestor + ele mesmo", () => {
    const vinculos = [
      { equipe_id: "e1", membro_id: "g", e_gestor: true },
      { equipe_id: "e1", membro_id: "v1", e_gestor: false },
      { equipe_id: "e1", membro_id: "v2", e_gestor: false },
      // equipe onde g é só membro (não gestor) — não conta
      { equipe_id: "e2", membro_id: "g", e_gestor: false },
      { equipe_id: "e2", membro_id: "v3", e_gestor: false },
      // equipe de outro gestor
      { equipe_id: "e3", membro_id: "g2", e_gestor: true },
      { equipe_id: "e3", membro_id: "v4", e_gestor: false },
    ];
    expect([...calcularEscopoGestor("g", vinculos)].sort()).toEqual(["g", "v1", "v2"]);
    expect([...calcularEscopoGestor("sem-equipe", vinculos)]).toEqual(["sem-equipe"]);
  });
});
