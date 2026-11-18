import { describe, expect, it } from "vitest";
import { blocosDocumento, type Bloco } from "@/lib/documento-formatado";

const t = (texto: string, negrito = false) => ({ texto, negrito });

/** Texto que um bloco representa, sem os marcadores (para conferir que nada se perde). */
function textoDoBloco(b: Bloco): string {
  return b.tipo === "vazio" ? "" : b.trechos.map((x) => x.texto).join("");
}

describe("blocosDocumento", () => {
  it("# e ## viram títulos de nível 1 e 2", () => {
    expect(blocosDocumento("# Título")).toEqual([{ tipo: "titulo", nivel: 1, trechos: [t("Título")] }]);
    expect(blocosDocumento("## CLÁUSULA 1ª")).toEqual([{ tipo: "titulo", nivel: 2, trechos: [t("CLÁUSULA 1ª")] }]);
  });

  it("**texto** vira negrito dentro do parágrafo", () => {
    expect(blocosDocumento("**CONTRATANTE:** Fulano")).toEqual([
      { tipo: "paragrafo", trechos: [t("CONTRATANTE:", true), t(" Fulano")] },
    ]);
  });

  it("- no começo da linha vira item; sem espaço fica literal", () => {
    expect(blocosDocumento("- Juros de 1%")).toEqual([{ tipo: "item", trechos: [t("Juros de 1%")] }]);
    expect(blocosDocumento("-sem espaço")).toEqual([{ tipo: "paragrafo", trechos: [t("-sem espaço")] }]);
  });

  it("** sem par fica literal, sem negrito pela metade", () => {
    expect(blocosDocumento("5 ** 2")).toEqual([{ tipo: "paragrafo", trechos: [t("5 ** 2")] }]);
    expect(blocosDocumento("**a** e **b")).toEqual([{ tipo: "paragrafo", trechos: [t("a", true), t(" e **b")] }]);
  });

  it("linha vazia vira bloco vazio; aceita \\r\\n", () => {
    expect(blocosDocumento("a\r\n\r\nb")).toEqual([
      { tipo: "paragrafo", trechos: [t("a")] },
      { tipo: "vazio" },
      { tipo: "paragrafo", trechos: [t("b")] },
    ]);
  });

  it("texto sem marcadores sai inteiro, linha por linha (contratos antigos)", () => {
    const texto =
      "CONTRATO entre Empresa X e Cliente Y, CPF 123.456.789-09.\nValor: R$ 25.000,00.\nItens:\n10 x Módulo 550 W\n\nVendedor: Ana.";
    expect(blocosDocumento(texto).map(textoDoBloco).join("\n")).toBe(texto);
  });
});

describe("DocumentoFormatado (HTML)", () => {
  it("preserva espaços e recuos do modelo (whitespace-pre-wrap), como antes", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DocumentoFormatado } = await import("@/components/documento-formatado");
    const html = renderToStaticMarkup(createElement(DocumentoFormatado, { texto: "   a) cláusula\nAssinatura: ____      Data: __" }));
    expect(html).toMatch(/^<div class="[^"]*whitespace-pre-wrap/);
    expect(html).toContain("   a) cláusula");
  });
});
