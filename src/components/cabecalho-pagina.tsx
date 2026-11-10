import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Ação principal sobre a faixa do cabeçalho: pílula dourada com brilho no hover. */
export const CLASSE_ACAO_CABECALHO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-dourado px-5 text-sm font-semibold text-carvao outline-none transition-[box-shadow,transform] duration-200 ease-raion hover:shadow-[0_10px_30px_rgb(212_175_55/0.35)] focus-visible:ring-2 focus-visible:ring-offwhite/80 focus-visible:ring-offset-2 focus-visible:ring-offset-carvao active:scale-[0.98]";

/** Ação secundária sobre a faixa: pílula de vidro clara (`r-btn-vidro` do canvas). */
export const CLASSE_VIDRO_CABECALHO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-[18px] text-sm font-medium whitespace-nowrap text-offwhite outline-none backdrop-blur-md transition-colors duration-200 ease-raion hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-offwhite/80 focus-visible:ring-offset-2 focus-visible:ring-offset-carvao";

/** Seletor de visão sobre a faixa (`r-seg-escuro` do canvas): trilho de vidro; o item atual fica dourado. */
export const CLASSE_SEGMENTO_CABECALHO = "inline-flex gap-0.5 rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur-md";
export function classeItemSegmentoCabecalho(atual: boolean) {
  return `inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 md:min-h-9 text-sm font-medium whitespace-nowrap outline-none transition-colors duration-200 ease-raion focus-visible:ring-2 focus-visible:ring-offwhite/80 ${
    atual ? "bg-dourado text-carvao" : "text-offwhite/80 hover:text-offwhite"
  }`;
}

/** Tons dos selos sobre a faixa (`r-selo` do canvas): `destaque` é a etapa ou o estado principal. */
const TOM_SELO_CABECALHO = {
  destaque: "bg-dourado text-carvao",
  neutro: "bg-white/12 text-offwhite",
  atencao: "bg-atencao/22 text-[#ecd78f]",
  positivo: "bg-[#1f7a4d]/45 text-[#bfe8d2]",
  negativo: "bg-[#b42318]/45 text-[#fcd4cf]",
} as const;

export function SeloCabecalho({ tom = "neutro", children }: { tom?: keyof typeof TOM_SELO_CABECALHO; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TOM_SELO_CABECALHO[tom]}`}>{children}</span>;
}

/**
 * Abertura das telas: paisagem da marca sob degradê carvão, sempre escura (igual nos dois temas).
 * `destaque` é a versão alta do Início; `detalhe` (fichas) é a mais baixa, com a foto mais apagada; as demais
 * telas usam a faixa compacta. Nas fichas, `voltar` leva à lista, `selos` vêm sob o título e `valor` fica à direita.
 */
export function CabecalhoPagina({
  sobretitulo,
  titulo,
  descricao,
  acoes,
  voltar,
  inicio,
  selos,
  valor,
  destaque = false,
  detalhe = false,
}: {
  sobretitulo?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  voltar?: { href: string; rotulo: ReactNode };
  /** Antes do texto (ex.: avatar do contato). */
  inicio?: ReactNode;
  selos?: ReactNode;
  valor?: ReactNode;
  destaque?: boolean;
  detalhe?: boolean;
}) {
  const espaco = destaque ? "px-6 py-8 md:px-10 md:py-12" : detalhe ? "px-6 py-6 md:px-8" : "px-6 py-6 md:px-8 md:py-8";
  return (
    <section className="faixa-marca relative isolate overflow-hidden rounded-3xl bg-carvao text-offwhite">
      <div aria-hidden className={`absolute inset-0 -z-10 bg-[url(/marca/paisagem.jpg)] bg-cover bg-[center_62%] ${detalhe ? "opacity-35" : ""}`} />
      <div
        aria-hidden
        className={`absolute inset-0 -z-10 bg-gradient-to-r ${detalhe ? "from-carvao/95 via-carvao/80 to-carvao/55" : "from-carvao/90 via-carvao/65 to-carvao/15"}`}
      />
      <div className={`flex flex-wrap items-end justify-between gap-6 ${espaco}`}>
        <div className="flex min-w-0 items-end gap-[18px]">
          {inicio}
          <div className="min-w-0 max-w-2xl">
            {voltar && (
              <Link
                href={voltar.href}
                className="mb-3 inline-flex min-h-8 items-center gap-1 rounded text-[13px] font-medium text-offwhite/70 outline-none transition-colors hover:text-offwhite focus-visible:ring-2 focus-visible:ring-offwhite/80"
              >
                <ChevronLeft size={16} aria-hidden />
                {voltar.rotulo}
              </Link>
            )}
            {sobretitulo && <p className="text-[11px] font-semibold tracking-[0.14em] text-offwhite/70 uppercase">{sobretitulo}</p>}
            <h1 className={`font-light tracking-tight break-words text-offwhite ${sobretitulo ? "mt-2" : ""} ${destaque ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl"}`}>
              {titulo}
            </h1>
            {descricao && <p className="mt-2 text-sm text-offwhite/75">{descricao}</p>}
            {selos && <div className="mt-3 flex flex-wrap gap-1.5">{selos}</div>}
          </div>
        </div>
        {(acoes || valor) && (
          <div className="flex flex-col gap-3.5 md:items-end">
            {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
            {valor && <div className="font-titulo text-3xl font-light tracking-tight text-offwhite tabular-nums md:text-right">{valor}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
