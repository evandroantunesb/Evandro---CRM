import { describe, expect, it } from "vitest";
import { montarHistorico } from "@/lib/obras/historico";

const linha = (dados: unknown) => ({ created_at: "2026-11-26T12:00:00Z", tipo: "concessionaria_obra_alterada", setor: "engenharia", dados, autor_membro_id: null });

describe("histórico: concessionária da obra (20261223100000_concessionarias.sql)", () => {
  it("mostra de onde para onde; sem a anterior, diz que a obra não tinha", () => {
    const textos = montarHistorico([linha({ de: null, para: "Copel" }), linha({ de: "Copel", para: "Cemig" })], new Map()).map(
      (i) => `${i.tipoRotulo}: ${i.descricao}`,
    );
    expect(textos).toEqual(expect.arrayContaining(["Concessionária alterada: sem concessionária → Copel", "Concessionária alterada: Copel → Cemig"]));
  });

  it("diz quando o checklist foi trocado junto (regra 7)", () => {
    const [item] = montarHistorico([linha({ de: "Copel", para: "Cemig", checklist_trocado: true })], new Map());
    expect(item.descricao).toBe("Copel → Cemig, checklist trocado");
  });

  it("protocolo registrado com o nome do canal da concessionária", () => {
    const [item] = montarHistorico(
      [{ created_at: "2026-11-26T12:00:00Z", tipo: "protocolo_engenharia_registrado", setor: "engenharia", dados: { distribuidora: "Cemig", canal: "Agência virtual" }, autor_membro_id: null }],
      new Map(),
    );
    expect(item.descricao).toBe("Cemig, via Agência virtual");
  });
});
