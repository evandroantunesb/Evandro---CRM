import type { ReactNode } from "react";
import type { Categoria } from "@/lib/forecast";
/** Filtros da tela, na URL: mês escolhido, categoria, carteira (admin e gestor) e lista completa. */
export type FiltrosForecast = { mes: string; categoria?: Categoria; carteira?: "minha"; todos?: boolean };

export function queryForecast(f: FiltrosForecast, mesAtual: string) {
  const p = new URLSearchParams();
  if (f.carteira) p.set("carteira", f.carteira);
  if (f.mes !== mesAtual) p.set("mes", f.mes.slice(0, 7));
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.todos) p.set("todos", "1");
  const q = p.toString();
  return `/forecast${q ? `?${q}` : ""}`;
}

/** Cor de cada categoria (dourado cheio, médio e claro), igual no gráfico, na legenda e na lista. */
export const COR: Record<Categoria, string> = { compromisso: "bg-dourado", provavel: "bg-[#e6cc7a]", possivel: "bg-[#f2e4b8]" };

export function MarcaCategoria({ categoria, children }: { categoria: Categoria; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
      <i aria-hidden className={`h-1.5 w-3.5 shrink-0 rounded-full ${COR[categoria]}`} />
      {children}
    </span>
  );
}

