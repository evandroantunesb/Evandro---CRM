/**
 * Situação dos dados da EMISSÃO da proposta (puro). Hoje nenhuma proposta preserva os números emitidos: a situação é
 * SEMPRE indisponível, com a mensagem exata do contrato (.aurora/contratos/m2-p0-motor-estimativa.md) e a data de
 * emissão formatada em DD/MM/AAAA no fuso de São Paulo. Nunca dizer "conjunto emitido".
 *
 * Datas derivadas à mão (São Paulo = UTC-3, sem horário de verão desde 2019):
 *   2026-10-15T12:00:00Z -> 15/10/2026 09:00      2026-10-16T02:30:00Z -> 15/10/2026 23:30 (ainda dia 15)
 *   2026-10-16T03:00:00Z -> 16/10/2026 00:00      2026-01-01T02:59:59Z -> 31/12/2025 23:59:59
 */
import { describe, expect, it } from "vitest";
import {
  dataDaEmissao,
  emissaoPreservada,
  MENSAGEM_EMISSAO_INDISPONIVEL,
  mensagemEmissaoIndisponivel,
  situacaoDaEmissao,
} from "@/lib/propostas/emissao-preservada";

const TEXTO = "Os valores de economia desta proposta não estão disponíveis nesta versão do sistema. Fale com o seu vendedor.";

describe("emissaoPreservada", () => {
  it("nunca há dados da emissão preservados (sem snapshot), qualquer que seja a proposta", () => {
    expect(emissaoPreservada()).toBe(false);
    expect(emissaoPreservada(undefined)).toBe(false);
    expect(emissaoPreservada(null)).toBe(false);
    expect(emissaoPreservada({})).toBe(false);
    expect(emissaoPreservada({ created_at: "2026-10-15T12:00:00Z", token: "t", snapshot: { economia: 1 } })).toBe(false);
  });
});

describe("dataDaEmissao", () => {
  it("formata DD/MM/AAAA", () => {
    expect(dataDaEmissao("2026-10-15T12:00:00Z")).toBe("15/10/2026");
    expect(dataDaEmissao(new Date("2026-10-15T12:00:00Z"))).toBe("15/10/2026");
  });

  it("usa o fuso de São Paulo, não o UTC", () => {
    expect(dataDaEmissao("2026-10-16T02:30:00Z")).toBe("15/10/2026");
    expect(dataDaEmissao("2026-10-16T03:00:00Z")).toBe("16/10/2026");
    expect(dataDaEmissao("2026-01-01T02:59:59Z")).toBe("31/12/2025");
  });

  it("data ausente ou inválida = null (nunca 'Invalid Date')", () => {
    expect(dataDaEmissao(null)).toBeNull();
    expect(dataDaEmissao(undefined)).toBeNull();
    expect(dataDaEmissao("")).toBeNull();
    expect(dataDaEmissao("não é data")).toBeNull();
    expect(dataDaEmissao(new Date("x"))).toBeNull();
  });
});

describe("mensagemEmissaoIndisponivel", () => {
  it("o texto fixo é o do contrato", () => {
    expect(MENSAGEM_EMISSAO_INDISPONIVEL).toBe(TEXTO);
  });

  it("com data: 'Proposta emitida em DD/MM/AAAA. ' antes do texto fixo", () => {
    expect(mensagemEmissaoIndisponivel("2026-10-15T12:00:00Z")).toBe(`Proposta emitida em 15/10/2026. ${TEXTO}`);
    expect(mensagemEmissaoIndisponivel(new Date("2026-10-16T02:30:00Z"))).toBe(`Proposta emitida em 15/10/2026. ${TEXTO}`);
  });

  it("sem data (ou inválida): só o texto fixo, sem 'emitida em' e sem 'Invalid Date'", () => {
    for (const d of [undefined, null, "", "lixo"]) {
      const m = mensagemEmissaoIndisponivel(d);
      expect(m).toBe(TEXTO);
      expect(m).not.toContain("Invalid");
      expect(m).not.toContain("emitida em");
    }
  });

  it("nunca fala em 'conjunto emitido' nem traz número monetário", () => {
    const m = mensagemEmissaoIndisponivel("2026-10-15T12:00:00Z");
    expect(m.toLowerCase()).not.toContain("conjunto");
    expect(m).not.toMatch(/R\$|\d+,\d{2}/);
  });
});

describe("situacaoDaEmissao", () => {
  it("SEMPRE indisponível, com a mensagem completa e a data formatada", () => {
    expect(situacaoDaEmissao({ created_at: "2026-10-15T12:00:00Z" })).toEqual({
      disponivel: false,
      mensagem: `Proposta emitida em 15/10/2026. ${TEXTO}`,
    });
  });

  it("proposta sem created_at: indisponível com o texto fixo", () => {
    expect(situacaoDaEmissao({})).toEqual({ disponivel: false, mensagem: TEXTO });
    expect(situacaoDaEmissao({ created_at: null })).toEqual({ disponivel: false, mensagem: TEXTO });
  });

  it("created_at inválido: indisponível e sem 'Invalid Date'", () => {
    const s = situacaoDaEmissao({ created_at: "lixo" });
    expect(s).toEqual({ disponivel: false, mensagem: TEXTO });
  });

  it("aceita Date", () => {
    expect(situacaoDaEmissao({ created_at: new Date("2026-10-16T03:00:00Z") })).toEqual({
      disponivel: false,
      mensagem: `Proposta emitida em 16/10/2026. ${TEXTO}`,
    });
  });

  it("o campo 'disponivel' nunca é true hoje (a mensagem acompanha a indisponibilidade)", () => {
    for (const p of [{}, { created_at: "2026-10-15T12:00:00Z" }, { created_at: new Date() }]) {
      const s = situacaoDaEmissao(p);
      expect(s.disponivel).toBe(false);
      expect("mensagem" in s).toBe(true);
    }
  });
});
