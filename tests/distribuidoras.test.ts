/** Resolução de distribuidora por município (Etapa 1 do wizard — pedido do Evandro em 2026-09-30). */
import { describe, expect, it } from "vitest";
import { normalizarTexto, resolverDistribuidora, type DistribuidoraCandidata } from "@/lib/distribuidoras";

describe("normalizarTexto", () => {
  it("remove acentos, espaços nas pontas e padroniza maiúsculas", () => {
    expect(normalizarTexto("  São Paulo  ")).toBe("SAO PAULO");
    expect(normalizarTexto("Contagem")).toBe("CONTAGEM");
    expect(normalizarTexto("sp")).toBe("SP");
  });

  it("string vazia ou só espaço vira string vazia", () => {
    expect(normalizarTexto("   ")).toBe("");
    expect(normalizarTexto("")).toBe("");
  });
});

describe("resolverDistribuidora", () => {
  const cpfl: DistribuidoraCandidata = { codigoIbge: "3550308", siglaDistribuidora: "CPFL-PAULISTA", nomeDistribuidora: "CPFL Paulista" };
  const enel: DistribuidoraCandidata = { codigoIbge: "3550308", siglaDistribuidora: "ENEL-SP", nomeDistribuidora: "Enel São Paulo" };

  it("nenhuma candidata: não encontrada", () => {
    expect(resolverDistribuidora([])).toEqual({ tipo: "nao_encontrada" });
  });

  it("uma candidata: única, preenche automático", () => {
    expect(resolverDistribuidora([cpfl])).toEqual({ tipo: "unica", distribuidora: cpfl });
  });

  it("mais de uma candidata: ambígua, pede seleção ao vendedor", () => {
    expect(resolverDistribuidora([cpfl, enel])).toEqual({ tipo: "ambigua", distribuidoras: [cpfl, enel] });
  });
});
