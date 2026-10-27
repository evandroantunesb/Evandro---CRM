import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { EstadoMarco, Marco, MarcosVenda as Marcos } from "@/lib/venda";

const ICONE: Record<EstadoMarco, { conteudo: ReactNode; classe: string }> = {
  cumprido: { conteudo: <Check size={14} strokeWidth={2.5} />, classe: "bg-energia text-white" },
  pendente: { conteudo: <span className="h-2 w-2 rounded-full bg-current" />, classe: "bg-dourado/15 text-dourado-texto ring-1 ring-dourado/40" },
  bloqueado: { conteudo: <span className="h-1.5 w-1.5 rounded-full bg-current" />, classe: "bg-superficie-2 text-texto-2" },
};

/** Próximo passo da jornada: texto do link para o primeiro marco pendente que tem onde agir. */
const PROXIMO_PASSO: Record<string, string> = {
  "#proposta": "Gerar proposta",
  "#contrato": "Ir ao contrato",
  "#pagamento": "Ir ao pagamento",
};

/**
 * Jornada da venda: Proposta (quando informada) e os 3 marcos do fechamento. Só leitura: nenhuma ação
 * de escrita aqui. A ação do marco "Venda ganha" é o componente `Fechamento`, recebido como `children`;
 * os demais marcos só apontam para os cartões que já existem na ficha. `hrefBase` é prefixado às
 * âncoras (ex.: a aba da ficha onde ficam proposta, contrato e pagamento).
 */
export function MarcosVenda({
  marcos,
  obra,
  proposta = null,
  hrefBase = "",
  soVenda = false,
  children,
}: {
  marcos: Marcos;
  /** Eletroposto: ainda sem contrato nem pagamento no Raion, a jornada é só Proposta e Venda ganha. */
  soVenda?: boolean;
  /** Obra lida sob RLS; null quando não existe ou a pessoa não a enxerga. */
  obra: { id: string; numero: number } | null;
  /** Situação da proposta (fora dos marcos do fechamento), quando quem vê pode emitir proposta. */
  proposta?: Marco | null;
  hrefBase?: string;
  /** A ação de fechamento (componente `Fechamento`), mostrada no marco "Venda ganha". */
  children?: ReactNode;
}) {
  const etapas = (soVenda ? [proposta, marcos.venda] : [proposta, marcos.venda, marcos.contrato, marcos.pagamento]).filter(
    (m): m is Marco => m != null,
  );
  // O contador "x de 3 marcos" só vale para a jornada completa.
  const progresso = soVenda ? null : marcos.progresso;
  // Negócio perdido (sem contador de progresso): não há próximo passo a sugerir.
  const proximo =
    marcos.progresso === null ? undefined : etapas.find((m) => m.estado === "pendente" && m.ancora && PROXIMO_PASSO[m.ancora]);
  return (
    <div className="flex flex-col gap-4">
      {proximo?.ancora && (
        <Link
          href={`${hrefBase}${proximo.ancora}`}
          className="group flex min-h-12 items-center justify-between gap-3 rounded-xl bg-dourado/10 px-4 py-2.5 text-sm transition-colors hover:bg-dourado/15"
        >
          <span className="min-w-0">
            <span className="sobretitulo block text-[10px]">Próximo passo</span>
            <span className="block font-semibold text-texto">{PROXIMO_PASSO[proximo.ancora]}</span>
          </span>
          <ArrowRight size={18} aria-hidden className="shrink-0 text-dourado-texto transition-transform duration-200 ease-raion group-hover:translate-x-0.5" />
        </Link>
      )}
      <ol
        className={`grid grid-cols-2 gap-x-3 gap-y-5 ${etapas.length === 4 ? "md:grid-cols-4" : etapas.length === 3 ? "md:grid-cols-3" : ""}`}
      >
        {etapas.map((m) => (
          <ItemMarco key={m.titulo} marco={m} hrefBase={hrefBase}>
            {m === marcos.venda ? children : null}
          </ItemMarco>
        ))}
      </ol>
      {(progresso || obra) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha pt-3 text-sm">
          {progresso && (
            <p className={marcos.concluida ? "font-medium text-energia" : "text-texto-2"}>
              {marcos.concluida ? `Venda concluída · ${progresso}` : progresso}
            </p>
          )}
          {obra && (
            <Link href={`/obras/${obra.id}`} className="w-fit font-medium text-dourado-texto underline-offset-2 hover:underline">
              Ver obra nº {obra.numero}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ItemMarco({ marco, hrefBase, children }: { marco: Marco; hrefBase: string; children?: ReactNode }) {
  const icone = ICONE[marco.estado];
  return (
    <li className="flex min-w-0 flex-col gap-2" data-marco-estado={marco.estado}>
      <span aria-hidden className={`flex size-7 shrink-0 items-center justify-center rounded-full ${icone.classe}`}>
        {icone.conteudo}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold text-texto">{marco.titulo}</p>
        <p className="text-sm text-texto-2">
          {marco.rotulo}
          {marco.ancora && (
            <>
              {" · "}
              <Link href={`${hrefBase}${marco.ancora}`} className="text-dourado-texto underline-offset-2 hover:underline">
                Ver
              </Link>
            </>
          )}
        </p>
        {children}
      </div>
    </li>
  );
}
