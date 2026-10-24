import type { LucideIcon } from "lucide-react";

export type Indicador = { Icone: LucideIcon; valor: string; legenda: string };

/**
 * Indicadores no topo da tela de Negócios (dados reais do escopo/filtro atual), numa superfície só
 * com fios entre eles — mesmo desenho dos indicadores do Início.
 */
export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <div className="painel grid grid-cols-2 lg:grid-cols-4 [&>*]:border-linha max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:[&>*:not(:last-child)]:border-r">
      {itens.map((it) => (
        <div key={it.legenda} className="flex min-w-0 flex-col gap-1 px-3.5 py-3 md:gap-1.5 md:px-6 md:py-5">
          <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-texto-2">
            <it.Icone size={15} className="shrink-0 text-dourado-texto" aria-hidden />
            <span className="truncate">{it.legenda}</span>
          </p>
          <p className="truncate font-titulo text-xl font-light tracking-tight text-texto tabular-nums md:text-3xl">{it.valor}</p>
        </div>
      ))}
    </div>
  );
}
