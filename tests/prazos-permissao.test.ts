/** Quem edita cada prazo (espelho da RLS de 20261124100000), sem banco. */
import { describe, expect, it } from "vitest";
import { CHAVES_PRAZO_OBRA } from "@/lib/obras/cronograma";
import { SETOR_PRAZO_OBRA, coordenaSetor, prazosObraEditaveis } from "@/lib/prazos-permissao";

describe("prazos das etapas por setor", () => {
  it("todo prazo tem um setor dono; a entrega contratada é do Operacional", () => {
    for (const c of CHAVES_PRAZO_OBRA) expect(SETOR_PRAZO_OBRA[c], c).toBeTruthy();
    expect(SETOR_PRAZO_OBRA.entrega_contratada).toBe("operacional");
  });

  it("admin e gestor editam todos; o coordenador, os do seu setor; os demais, nenhum", () => {
    expect(prazosObraEditaveis("admin", [])).toEqual([...CHAVES_PRAZO_OBRA]);
    expect(prazosObraEditaveis("gestor", [])).toEqual([...CHAVES_PRAZO_OBRA]);
    expect(prazosObraEditaveis("operacao", ["compras"])).toEqual(["compra", "entrega_material"]);
    expect(prazosObraEditaveis("operacao", ["engenharia"])).toEqual(["projeto", "homologacao", "vistoria", "conexao"]);
    expect(prazosObraEditaveis("operacao", ["operacional"])).toEqual(["instalacao", "entrega_contratada"]);
    expect(prazosObraEditaveis("operacao", [])).toEqual([]);
    for (const papel of ["vendedor", "sdr", null, undefined]) expect(prazosObraEditaveis(papel, ["compras"]), String(papel)).toEqual([]);
  });

  it("coordena o setor: admin e gestor sempre; operacao só com o setor", () => {
    expect(coordenaSetor("gestor", [], "engenharia")).toBe(true);
    expect(coordenaSetor("operacao", ["engenharia"], "engenharia")).toBe(true);
    expect(coordenaSetor("operacao", ["compras"], "engenharia")).toBe(false);
    expect(coordenaSetor("vendedor", ["engenharia"], "engenharia")).toBe(false);
  });
});
