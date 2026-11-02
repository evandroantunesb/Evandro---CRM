import type { ReactNode } from "react";

/** Ação principal sobre a faixa do cabeçalho: pílula dourada com brilho no hover. */
export const CLASSE_ACAO_CABECALHO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-dourado px-5 text-sm font-semibold text-carvao outline-none transition-[box-shadow,transform] duration-200 ease-raion hover:shadow-[0_10px_30px_rgb(212_175_55/0.35)] focus-visible:ring-2 focus-visible:ring-offwhite/80 focus-visible:ring-offset-2 focus-visible:ring-offset-carvao active:scale-[0.98]";

/**
 * Abertura das telas principais: paisagem da marca sob degradê carvão, sempre escura (igual nos dois temas).
 * `destaque` é a versão alta do Início; as demais telas usam a faixa compacta.
 */
export function CabecalhoPagina({
  sobretitulo,
  titulo,
  descricao,
  acoes,
  destaque = false,
}: {
  sobretitulo?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-carvao text-offwhite">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[url(/marca/paisagem.jpg)] bg-cover bg-[center_62%]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-carvao/90 via-carvao/65 to-carvao/15" />
      <div className={`flex flex-wrap items-end justify-between gap-6 ${destaque ? "px-6 py-8 md:px-10 md:py-12" : "px-6 py-6 md:px-8 md:py-8"}`}>
        <div className="max-w-xl">
          {sobretitulo && <p className="text-[11px] font-semibold tracking-[0.14em] text-offwhite/70 uppercase">{sobretitulo}</p>}
          <h1 className={`font-light tracking-tight text-offwhite ${sobretitulo ? "mt-2" : ""} ${destaque ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl"}`}>
            {titulo}
          </h1>
          {descricao && <p className="mt-2 text-sm text-offwhite/75">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
      </div>
    </section>
  );
}
