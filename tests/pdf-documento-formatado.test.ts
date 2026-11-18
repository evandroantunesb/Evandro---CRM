/**
 * Formatação no PDF dos documentos (contrato, procuração): confere a árvore que o `DocumentoPdf` entrega ao
 * react-pdf (o PDF final sai comprimido, sem texto legível para o teste).
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DocumentoPdf } from "@/lib/pdf-contrato";

type Estilo = Record<string, unknown>;

/** Expande componentes de função até chegar nos primitivos do react-pdf. */
function expandir(no: ReactNode): ReactNode {
  if (!isValidElement(no)) return no;
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return expandir((el.type as (p: unknown) => ReactNode)(el.props));
  return el;
}

/** Textos (strings) com o estilo achatado do `<Text>` mais próximo, na ordem do documento. */
function textos(no: ReactNode, estilo: Estilo = {}): { texto: string; estilo: Estilo }[] {
  const n = expandir(no);
  if (n == null || typeof n === "boolean") return [];
  if (typeof n === "string" || typeof n === "number") return [{ texto: String(n), estilo }];
  if (Array.isArray(n)) return n.flatMap((f) => textos(f, estilo));
  if (!isValidElement(n)) return [];
  const props = n.props as { children?: ReactNode; style?: Estilo | Estilo[]; render?: unknown };
  const proprio = Array.isArray(props.style) ? Object.assign({}, ...props.style) : (props.style ?? {});
  return textos(props.children, { ...estilo, ...proprio });
}

const marca = { logoUrl: null, nome: "Empresa X" };

describe("DocumentoPdf com formatação", () => {
  it("título, negrito e item saem sem os marcadores e com o estilo certo", () => {
    const arvore = DocumentoPdf({ rotulo: "Contrato", titulo: null, conteudo: "## CLÁUSULA 1ª\n**CONTRATANTE:** Fulano\n- item um", marca });
    const lista = textos(arvore);
    const juntos = lista.map((t) => t.texto).join("|");
    expect(juntos).not.toContain("##");
    expect(juntos).not.toContain("**");
    const clausula = lista.find((t) => t.texto === "CLÁUSULA 1ª");
    expect(clausula?.estilo.fontFamily).toBe("Helvetica-Bold");
    const contratante = lista.find((t) => t.texto === "CONTRATANTE:");
    expect(contratante?.estilo.fontFamily).toBe("Helvetica-Bold");
    const fulano = lista.find((t) => t.texto === " Fulano");
    expect(fulano?.estilo.fontFamily).not.toBe("Helvetica-Bold");
    expect(juntos).toContain("• ");
    expect(juntos).toContain("item um");
  });

  it("texto sem marcadores continua linha a linha", () => {
    const lista = textos(DocumentoPdf({ rotulo: "Contrato", titulo: null, conteudo: "Linha A\nLinha B", marca }));
    const juntos = lista.map((t) => t.texto);
    expect(juntos).toContain("Linha A");
    expect(juntos).toContain("Linha B");
  });
});
