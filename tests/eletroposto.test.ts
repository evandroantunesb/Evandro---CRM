import { describe, expect, it } from "vitest";
import {
  CATALOGO_ELETROPOSTO,
  cenarioMensal,
  margemPorKwh,
  mascararWhatsapp,
  normalizarModelos,
  numeroPropostaEletroposto,
  paybackMeses,
  precosDoCatalogo,
  receitaEcossistemaMensal,
  whatsappValido,
} from "@/lib/eletroposto";

// Números de referência da proposta-modelo da IBS (proposta_carregador_veicular_ibs_branco.html).
describe("simulação do eletroposto", () => {
  it("reproduz o cenário realista do modelo", () => {
    const c = cenarioMensal();
    expect(Math.round(c.faturamento)).toBe(12600);
    expect(Math.round(c.custo)).toBe(6188);
    expect(Math.round(c.resultado)).toBe(6412);
    expect(c.recargas).toBe(140);
  });

  it("margens do Pacote Fidelidade por faixa", () => {
    expect(margemPorKwh(20).toFixed(2)).toBe("0.92");
    expect(margemPorKwh(22).toFixed(2)).toBe("0.93");
    expect(margemPorKwh(25).toFixed(2)).toBe("0.96");
    expect(margemPorKwh(30).toFixed(2)).toBe("1.00");
  });

  it("payback por modelo (Full Screen soma a receita do ecossistema)", () => {
    expect(paybackMeses("basic")).toBe(16);
    expect(paybackMeses("full")).toBe(19);
    expect(paybackMeses("screen")).toBe(17);
    expect(Math.round(receitaEcossistemaMensal("screen"))).toBe(2853);
    expect(receitaEcossistemaMensal("full")).toBe(0);
  });
});

describe("catálogo e seleção", () => {
  it("preços fixos por modelo", () => {
    expect(CATALOGO_ELETROPOSTO.basic.preco).toBe(99900);
    expect(CATALOGO_ELETROPOSTO.full.preco).toBe(119900);
    expect(CATALOGO_ELETROPOSTO.screen.preco).toBe(149900);
  });

  it("normaliza a seleção: sem repetição, ordem do catálogo, ignora o desconhecido", () => {
    expect(normalizarModelos(["screen", "basic", "screen", "outro"])).toEqual(["basic", "screen"]);
    expect(normalizarModelos([])).toEqual([]);
  });

  it("congela um preço por modelo escolhido, sem somar", () => {
    expect(precosDoCatalogo(["basic", "full"])).toEqual({ basic: 99900, full: 119900 });
  });

  it("número da proposta a partir do número do negócio", () => {
    expect(numeroPropostaEletroposto(7)).toBe("EV-0007");
    expect(numeroPropostaEletroposto(12345)).toBe("EV-12345");
  });
});

describe("WhatsApp", () => {
  it("aceita celular com DDD e recusa o resto", () => {
    expect(whatsappValido("(45) 99999-9999")).toBe(true);
    expect(whatsappValido("45999999999")).toBe(true);
    expect(whatsappValido("(45) 3333-3333")).toBe(false);
    expect(whatsappValido("999999999")).toBe(false);
  });

  it("máscara enquanto digita, no máximo 11 dígitos", () => {
    expect(mascararWhatsapp("4")).toBe("(4");
    expect(mascararWhatsapp("45999")).toBe("(45) 999");
    expect(mascararWhatsapp("459999999990000")).toBe("(45) 99999-9999");
    expect(mascararWhatsapp("")).toBe("");
  });
});
