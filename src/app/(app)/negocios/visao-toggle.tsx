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
    <div className="inline-flex items-center gap-0.5 rounded-full border border-linha bg-superficie-2 p-0.5">
      {opcoes.map(({ valor, rotulo, Icone }) => (
        <Link
          key={valor}
          href={`/negocios?${query}visao=${valor}`}
          onClick={() => {
            document.cookie = `${COOKIE_VISAO}=${valor}; path=/; max-age=${60 * 60 * 24 * 365}`;
          }}
          aria-current={visao === valor ? "page" : undefined}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-200 ease-raion md:min-h-8 ${
            visao === valor ? "bg-superficie text-texto shadow-sm" : "text-texto-2 hover:text-texto"
          }`}
        >
          <Icone size={15} className={visao === valor ? "text-dourado-texto" : ""} aria-hidden />
          {rotulo}
        </Link>
      ))}
    </div>
  );
}
