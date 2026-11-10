import { describe, expect, it } from "vitest";
import { MARCA_PADRAO, contraste, marcaDoApp, textoSobre, validarMarca, variaveisMarca } from "@/lib/marca-cores";

describe("contraste e texto sobre a cor", () => {
  it("razão WCAG: preto e branco dão 21; o padrão Raion é legível", () => {
    expect(Math.round(contraste("#000000", "#FFFFFF") * 100) / 100).toBe(21);
    expect(contraste("#D4AF37", "#0F0F10")).toBeGreaterThanOrEqual(9);
  });

  it("texto sobre a cor: o de maior contraste", () => {
    expect(textoSobre("#D4AF37")).toBe("#0F0F10");
    expect(textoSobre("#123C45")).toBe("#FFFFFF");
  });
});

describe("validarMarca", () => {
  it("padrão Raion passa", () => {
    expect(validarMarca(MARCA_PADRAO)).toEqual([]);
  });

  it("barra clara demais é recusada", () => {
    const p = validarMarca({ barra: "#EDDB9F", destaque: "#D4AF37" });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("clara demais");
  });

  it("destaque em que nem preto nem branco ficam legíveis é recusado", () => {
    const p = validarMarca({ barra: "#0F0F10", destaque: "#7A7A7A" });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("botões");
  });
});

describe("variaveisMarca", () => {
  it("as variáveis do destaque e da barra, com tons legíveis", () => {
    const v = variaveisMarca({ barra: "#123C45", destaque: "#0E9F8A" });
    expect(Object.keys(v).sort()).toEqual(
      ["--color-acao", "--color-acao-forte", "--color-dourado", "--color-dourado-texto", "--color-sobre-acao", "--cor-barra"].sort(),
    );
    expect(v["--color-dourado"]).toBe("#0E9F8A");
    expect(v["--color-acao"]).toBe("#0E9F8A");
    expect(v["--color-sobre-acao"]).toBe(textoSobre("#0E9F8A"));
    expect(v["--cor-barra"]).toBe("#123C45");
    const [claro, escuro] = v["--color-dourado-texto"].match(/#[0-9A-F]{6}/gi)!;
    expect(contraste(claro, "#FAF8F3")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(escuro, "#0F0F10")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("marcaDoApp", () => {
  it("sem identidade ou sem cores: padrão Raion (nula)", () => {
    expect(marcaDoApp(null)).toBeNull();
    expect(marcaDoApp({ cor_primaria: null, cor_destaque: null })).toBeNull();
  });

  it("combinação ilegível já salva: padrão Raion (nula)", () => {
    expect(marcaDoApp({ cor_primaria: "#EDDB9F", cor_destaque: "#D4AF37" })).toBeNull();
  });

  it("só uma cor preenchida: a outra fica no padrão", () => {
    expect(marcaDoApp({ cor_primaria: "#123C45", cor_destaque: null })).toEqual({ barra: "#123C45", destaque: MARCA_PADRAO.destaque });
    expect(marcaDoApp({ cor_primaria: null, cor_destaque: "#0E9F8A" })).toEqual({ barra: MARCA_PADRAO.barra, destaque: "#0E9F8A" });
  });
});
