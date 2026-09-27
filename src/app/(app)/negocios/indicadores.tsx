import type { LucideIcon } from "lucide-react";

export type Indicador = { Icone: LucideIcon; valor: string; legenda: string };

/** Faixa de indicadores no topo da tela de Negócios (4 cards, dados reais do escopo/filtro atual). */
export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((it) => (
        <div key={it.legenda} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dourado/10 text-dourado">
            <it.Icone size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-zinc-900">{it.valor}</p>
            <p className="truncate text-xs text-zinc-500">{it.legenda}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
