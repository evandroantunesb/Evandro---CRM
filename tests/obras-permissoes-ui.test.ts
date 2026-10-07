import { describe, expect, it } from "vitest";
import { acaoSetor, type ContextoAtuacao } from "@/lib/obras/permissoes-ui";

const ctx = (c: Partial<ContextoAtuacao>): ContextoAtuacao => ({
  papel: "operacao",
  meusSetores: [],
  minhasParticipacoesAtivas: [],
  ...c,
});

describe("acaoSetor (espelho de autorizacao_setor_obra)", () => {
  it("admin atua em qualquer setor operacional", () => {
    for (const s of ["compras", "engenharia", "operacional"])
      expect(acaoSetor(ctx({ papel: "admin" }), "o1", s)).toBe("admin");
  });
  it("setor comercial é sempre nulo, até para admin", () => {
    expect(acaoSetor(ctx({ papel: "admin" }), "o1", "comercial")).toBeNull();
    expect(
      acaoSetor(
        ctx({ meusSetores: [{ setor: "comercial", capacidade: "coordenar" }] }),
        "o1",
        "comercial",
      ),
    ).toBeNull();
  });
  it("papéis comerciais e ausentes: nulo", () => {
    for (const papel of ["gestor", "vendedor", "sdr", undefined, null]) {
      const c = ctx({
        papel,
        meusSetores: [{ setor: "compras", capacidade: "coordenar" }],
        minhasParticipacoesAtivas: [{ obraId: "o1", setor: "compras" }],
      });
      expect(acaoSetor(c, "o1", "compras")).toBeNull();
    }
  });
  it("operacao coordena só o próprio setor, mesmo sem participar", () => {
    const c = ctx({ meusSetores: [{ setor: "engenharia", capacidade: "coordenar" }] });
    expect(acaoSetor(c, "o1", "engenharia")).toBe("coordenar");
    expect(acaoSetor(c, "o1", "compras")).toBeNull();
    expect(acaoSetor(c, "o1", "operacional")).toBeNull();
  });
  it("executar exige o setor E participação ativa naquela obra e setor", () => {
    const setores = [{ setor: "compras", capacidade: "executar" }];
    expect(acaoSetor(ctx({ meusSetores: setores }), "o1", "compras")).toBeNull();
    expect(
      acaoSetor(
        ctx({
          meusSetores: setores,
          minhasParticipacoesAtivas: [{ obraId: "o1", setor: "compras" }],
        }),
        "o1",
        "compras",
      ),
    ).toBe("executar");
    expect(
      acaoSetor(
        ctx({
          meusSetores: setores,
          minhasParticipacoesAtivas: [{ obraId: "o2", setor: "compras" }],
        }),
        "o1",
        "compras",
      ),
    ).toBeNull();
    expect(
      acaoSetor(
        ctx({
          meusSetores: setores,
          minhasParticipacoesAtivas: [{ obraId: "o1", setor: "engenharia" }],
        }),
        "o1",
        "compras",
      ),
    ).toBeNull();
    // participa, mas não tem o setor (ex.: setor retirado): nulo
    expect(
      acaoSetor(
        ctx({ minhasParticipacoesAtivas: [{ obraId: "o1", setor: "compras" }] }),
        "o1",
        "compras",
      ),
    ).toBeNull();
  });
  it("coordenar prevalece sobre executar", () => {
    const c = ctx({
      meusSetores: [{ setor: "compras", capacidade: "coordenar" }],
      minhasParticipacoesAtivas: [{ obraId: "o1", setor: "compras" }],
    });
    expect(acaoSetor(c, "o1", "compras")).toBe("coordenar");
  });
});
