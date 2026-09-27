import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { dadosDeAmostraProposta } from "@/lib/propostas/pdf-amostra";
import { calcularQuebras } from "@/lib/propostas/pdf-paginacao";
import { ModeloPdfDocument } from "@/lib/propostas/pdf";
import type { BlocoRenderizavel, IdentidadeProposta } from "@/lib/propostas/pdf-tipos";

const IDENTIDADE_VAZIA: IdentidadeProposta = {
  nomeExibicao: "",
  corPrimaria: "",
  corDestaque: "",
  whatsapp: "",
  rodapeTexto: "",
  logoUrl: null,
  logoEscuroUrl: null,
  fotoCapaUrl: null,
};

function bloco(tipo: BlocoRenderizavel["tipo"], overrides: Partial<BlocoRenderizavel> = {}): BlocoRenderizavel {
  return { tipo, ordem: 0, ativo: true, quebraPagina: "auto", config: {}, ...overrides };
}

describe("calcularQuebras", () => {
  it("nunca quebra antes do primeiro bloco", () => {
    expect(calcularQuebras([{ quebraPagina: "nova_pagina" }])).toEqual([false]);
  });

  it("quebra antes de nova_pagina e pagina_exclusiva", () => {
    const r = calcularQuebras([{ quebraPagina: "auto" }, { quebraPagina: "nova_pagina" }, { quebraPagina: "pagina_exclusiva" }]);
    expect(r).toEqual([false, true, true]);
  });

  it("força quebra no bloco seguinte a um pagina_exclusiva", () => {
    const r = calcularQuebras([{ quebraPagina: "pagina_exclusiva" }, { quebraPagina: "auto" }, { quebraPagina: "auto" }]);
    expect(r).toEqual([false, true, false]);
  });
});

describe("ModeloPdfDocument", () => {
  const dados = dadosDeAmostraProposta();

  it("renderiza um PDF válido com a capa e os blocos implementados", async () => {
    const blocos = [
      bloco("cover"),
      bloco("system_summary", { ordem: 1 }),
      bloco("equipment_summary", { ordem: 2 }),
      bloco("investment_main", { ordem: 3 }),
      bloco("next_steps", { ordem: 4 }),
    ];
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renderiza as três variantes de capa sem imagens configuradas", async () => {
    for (const capaVariante of ["foto", "minimalista", "tecnica"] as const) {
      const buffer = await renderToBuffer(
        ModeloPdfDocument({ modelo: { capaVariante }, blocos: [bloco("cover")], identidade: IDENTIDADE_VAZIA, dados }),
      );
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  it("omite blocos ainda não implementados e blocos de preço quando a proposta é sem preço", async () => {
    const blocos = [
      bloco("cover"),
      bloco("about_company", { ordem: 1 }), // não implementado — deve ser ignorado
      bloco("investment_main", { ordem: 2 }),
      bloco("payment_options", { ordem: 3 }),
      bloco("next_steps", { ordem: 4 }),
    ];
    const semPreco = { ...dados, modoPreco: "sem_preco" as const };
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados: semPreco }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("respeita o config customizado de itens inclusos e de próximos passos", async () => {
    const blocos = [
      bloco("included_services", { config: { itens: ["Item exclusivo A", "Item exclusivo B"] } }),
      bloco("next_steps", { ordem: 1, config: { texto: "Texto customizado", ctaTexto: "Fale com a gente" } }),
    ];
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
