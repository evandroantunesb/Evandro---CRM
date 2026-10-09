import Link from "next/link";
import type { ReactNode } from "react";
import type { EstadoMarco, Marco, MarcosVenda as Marcos } from "@/lib/venda";

const ICONE: Record<EstadoMarco, { simbolo: string; classe: string }> = {
  cumprido: { simbolo: "✓", classe: "bg-emerald-100 text-emerald-800" },
  pendente: { simbolo: "•", classe: "bg-amber-100 text-amber-800" },
  bloqueado: { simbolo: "–", classe: "bg-zinc-100 text-zinc-500" },
};

/**
 * Os 3 marcos do fechamento da venda. Só leitura: nenhuma ação de escrita aqui. A ação do marco
 * "Venda ganha" é o componente `Fechamento`, recebido como `children`; contrato e pagamento só
 * apontam para os cartões que já existem na ficha.
 */
export function MarcosVenda({
  marcos,
  obra,
  children,
}: {
  marcos: Marcos;
  /** Obra lida sob RLS; null quando não existe ou a pessoa não a enxerga. */
  obra: { id: string; numero: number } | null;
  /** A ação de fechamento (componente `Fechamento`), mostrada no marco "Venda ganha". */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        <ItemMarco marco={marcos.venda}>{children}</ItemMarco>
        <ItemMarco marco={marcos.contrato} />
        <ItemMarco marco={marcos.pagamento} />
      </ol>
      {(marcos.progresso || obra) && (
        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 text-sm">
          {marcos.progresso && (
            <p className={marcos.concluida ? "font-medium text-emerald-800" : "text-zinc-700"}>
              {marcos.concluida ? `Venda concluída · ${marcos.progresso}` : marcos.progresso}
            </p>
          )}
          {obra && (
            <Link href={`/obras/${obra.id}`} className="w-fit text-zinc-600 underline hover:text-zinc-900">
              Ver obra nº {obra.numero}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ItemMarco({ marco, children }: { marco: Marco; children?: ReactNode }) {
  const icone = ICONE[marco.estado];
  return (
    <li className="flex gap-3" data-marco-estado={marco.estado}>
      <span aria-hidden className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${icone.classe}`}>
        {icone.simbolo}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-zinc-900">{marco.titulo}</p>
        <p className="text-sm text-zinc-600">
          {marco.rotulo}
          {marco.ancora && (
            <>
              {" · "}
              <a href={marco.ancora} className="underline hover:text-zinc-900">
                Ver cartão
              </a>
            </>
          )}
        </p>
        {children}
      </div>
    </li>
  );
}
