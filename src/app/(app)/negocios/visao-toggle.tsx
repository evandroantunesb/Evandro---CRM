"use client";

import { Columns3, Rows3 } from "lucide-react";
import Link from "next/link";

const COOKIE_VISAO = "raion_negocios_visao";

/** Alternância Kanban/Lista: navega preservando os filtros e lembra a escolha (cookie, por navegador). */
export function VisaoToggle({ visao, query }: { visao: "kanban" | "lista"; query: string }) {
  const opcoes = [
    { valor: "kanban" as const, rotulo: "Kanban", Icone: Columns3 },
    { valor: "lista" as const, rotulo: "Lista", Icone: Rows3 },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5">
      {opcoes.map(({ valor, rotulo, Icone }) => (
        <Link
          key={valor}
          href={`/negocios?${query}visao=${valor}`}
          onClick={() => {
            document.cookie = `${COOKIE_VISAO}=${valor}; path=/; max-age=${60 * 60 * 24 * 365}`;
          }}
          aria-current={visao === valor ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            visao === valor ? "bg-carvao text-offwhite" : "text-carvao hover:bg-zinc-50"
          }`}
        >
          <Icone size={15} className={visao === valor ? "text-dourado" : "text-zinc-400"} />
          {rotulo}
        </Link>
      ))}
    </div>
  );
}
