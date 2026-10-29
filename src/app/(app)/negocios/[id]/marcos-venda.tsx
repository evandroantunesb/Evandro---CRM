import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { EstadoMarco, Marco, MarcosVenda as Marcos } from "@/lib/venda";

const ICONE: Record<EstadoMarco, { conteudo: ReactNode; classe: string }> = {
  cumprido: { conteudo: <Check size={14} strokeWidth={2.5} />, classe: "bg-energia text-white" },
  pendente: { conteudo: <span className="h-2 w-2 rounded-full bg-current" />, classe: "bg-dourado/15 text-dourado-texto ring-1 ring-dourado/40" },
  bloqueado: { conteudo: <span className="h-1.5 w-1.5 rounded-full bg-current" />, classe: "bg-superficie-2 text-texto-2" },
};

/** Próximo passo da jornada: texto do botão para o primeiro marco pendente que tem onde agir. */
const PROXIMO_PASSO: Record<string, string> = {
  "#proposta": "Gerar proposta",
  "#contrato": "Ir ao contrato",
  "#pagamento": "Ir ao pagamento",
};

function etapasDaJornada(marcos: Marcos, proposta: Marco | null, soVenda: boolean) {
  return (soVenda ? [proposta, marcos.venda] : [proposta, marcos.venda, marcos.contrato, marcos.pagamento]).filter(
    (m): m is Marco => m != null,
  );
}

/**
 * Âncora do próximo passo (ex.: "#proposta"), ou null quando não há o que sugerir (negócio perdido não tem).
 * A página usa isto para decidir se "Marcar como ganho" é a ação principal da barra ou fica no menu:
 * a barra nunca mostra dois botões principais.
 */
export function proximoPassoDaVenda(marcos: Marcos, proposta: Marco | null = null, soVenda = false): string | null {
  if (marcos.progresso === null) return null;
  // Venda ainda aberta depois da proposta: o próximo passo é marcar o ganho (a ação de fechamento), não o contrato.
  const marco = etapasDaJornada(marcos, proposta, soVenda).find(
    (m) => m.estado === "pendente" && (m === marcos.venda || (m.ancora && PROXIMO_PASSO[m.ancora])),
  );
  return marco && marco !== marcos.venda ? marco.ancora : null;
}

/**
 * Barra da venda: os passos da jornada (Proposta, quando informada, e os 3 marcos do fechamento) numa linha
 * e, ao lado, uma única ação principal: o próximo passo ou a ação de fechamento (`children`, o `Fechamento`).
 * Só leitura: os passos apontam para os cartões que já existem na ficha. `hrefBase` é prefixado às âncoras.
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
  /** A ação de fechamento (componente `Fechamento`), ao lado do próximo passo. */
  children?: ReactNode;
}) {
  const etapas = etapasDaJornada(marcos, proposta, soVenda);
  // O contador "x de 3 marcos" só vale para a jornada completa.
  const progresso = soVenda ? null : marcos.progresso;
  const proximo = proximoPassoDaVenda(marcos, proposta, soVenda);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <ol className="flex min-w-0 flex-1 items-start">
          {etapas.map((m, i) => (
            <ItemMarco key={m.titulo} marco={m} hrefBase={hrefBase} ultimo={i === etapas.length - 1} />
          ))}
        </ol>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {proximo && (
            <Link
              href={`${hrefBase}${proximo}`}
              className="group inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-acao px-5 text-sm font-semibold text-sobre-acao transition-colors hover:bg-acao-forte sm:flex-none md:min-h-10"
            >
              {PROXIMO_PASSO[proximo]}
              <ArrowRight size={16} aria-hidden className="transition-transform duration-200 ease-raion group-hover:translate-x-0.5" />
            </Link>
          )}
          {children}
        </div>
      </div>
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

function ItemMarco({ marco, hrefBase, ultimo }: { marco: Marco; hrefBase: string; ultimo: boolean }) {
  const icone = ICONE[marco.estado];
  const titulo = <span className="text-xs font-semibold text-texto md:text-sm">{marco.titulo}</span>;
  return (
    <li className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 text-center" data-marco-estado={marco.estado}>
      {/* Traço até o próximo passo: verde quando este já foi cumprido. */}
      {!ultimo && (
        <span aria-hidden className={`absolute top-3.5 left-1/2 h-0.5 w-full ${marco.estado === "cumprido" ? "bg-energia" : "bg-linha"}`} />
      )}
      <span aria-hidden className={`relative flex size-7 shrink-0 items-center justify-center rounded-full ${icone.classe}`}>
        {icone.conteudo}
      </span>
      {marco.ancora ? (
        <Link href={`${hrefBase}${marco.ancora}`} className="underline-offset-2 hover:underline">
          {titulo}
        </Link>
      ) : (
        titulo
      )}
      <span className="line-clamp-2 text-[11px] leading-tight text-texto-2 md:text-xs">{marco.rotulo}</span>
    </li>
  );
}
