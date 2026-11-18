import type { ReactNode } from "react";
import { blocosDocumento, type Bloco, type Trecho } from "@/lib/documento-formatado";

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return trechos.map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>));
}

/** Texto do contrato/procuração com título, negrito e lista (ver `blocosDocumento`). Itens seguidos viram uma lista. */
export function DocumentoFormatado({ texto, className }: { texto: string; className?: string }) {
  const blocos = blocosDocumento(texto);
  const saida: ReactNode[] = [];
  for (let i = 0; i < blocos.length; i++) {
    const b: Bloco = blocos[i];
    if (b.tipo === "item") {
      const itens: Trecho[][] = [];
      while (i < blocos.length && blocos[i].tipo === "item") {
        itens.push((blocos[i] as Extract<Bloco, { tipo: "item" }>).trechos);
        i++;
      }
      i--;
      saida.push(
        <ul key={i} className="my-1 list-disc pl-5">
          {itens.map((t, j) => (
            <li key={j}>
              <Trechos trechos={t} />
            </li>
          ))}
        </ul>,
      );
    } else if (b.tipo === "titulo") {
      const Tag = b.nivel === 1 ? "h2" : "h3";
      saida.push(
        <Tag key={i} className={b.nivel === 1 ? "mb-2 font-titulo text-base font-semibold" : "mt-3 mb-1 font-semibold"}>
          <Trechos trechos={b.trechos} />
        </Tag>,
      );
    } else if (b.tipo === "paragrafo") {
      saida.push(
        <p key={i} className="my-0.5">
          <Trechos trechos={b.trechos} />
        </p>,
      );
    } else {
      saida.push(<div key={i} className="h-3" aria-hidden="true" />);
    }
  }
  // Espaços e recuos do modelo aparecem como antes (cada bloco é uma linha).
  return <div className={className ? `whitespace-pre-wrap ${className}` : "whitespace-pre-wrap"}>{saida}</div>;
}
