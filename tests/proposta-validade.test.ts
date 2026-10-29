import { describe, expect, it } from "vitest";
import { somarDias, VALIDADE_PADRAO_DIAS, validadePadraoDoModelo } from "@/lib/propostas/proposta-simples";

describe("validade padrão da proposta", () => {
  it("sem modelo ou sem o campo: 10 dias", () => {
    expect(VALIDADE_PADRAO_DIAS).toBe(10);
    expect(validadePadraoDoModelo(null)).toBe(10);
    expect(validadePadraoDoModelo([{ tipo: "proposal_identity", config: {} }])).toBe(10);
    expect(validadePadraoDoModelo([{ tipo: "outro", config: { validadeDias: 30 } }])).toBe(10);
  });

  it("usa a validade do modelo padrão (número ou texto)", () => {
    expect(validadePadraoDoModelo([{ tipo: "proposal_identity", config: { validadeDias: 15 } }])).toBe(15);
    expect(validadePadraoDoModelo([{ tipo: "proposal_identity", config: { validadeDias: " 7 " } }])).toBe(7);
  });

  it("valor inválido cai no padrão", () => {
    for (const v of ["", "abc", 0, -3, 2.5, 500, null]) {
      expect(validadePadraoDoModelo([{ tipo: "proposal_identity", config: { validadeDias: v } }])).toBe(10);
    }
  });

  it("somarDias atravessa mês e ano", () => {
    expect(somarDias("2026-10-29", 10)).toBe("2026-11-08");
    expect(somarDias("2026-12-25", 10)).toBe("2027-01-04");
  });
});
