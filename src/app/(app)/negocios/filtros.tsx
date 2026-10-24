"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Janela } from "@/components/janela";

/**
 * Botão "Filtros" com a quantidade de filtros ativos; abre os campos (`children`, vindos do servidor)
 * numa janela. A janela fica dentro do <form> da página, então os campos vão no mesmo envio da busca;
 * um botão de envio ou link dentro dela fecha a janela antes de navegar.
 */
export function BotaoFiltros({ ativos, children }: { ativos: number; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-linha bg-superficie px-3.5 text-sm font-medium text-texto transition-colors duration-200 ease-raion hover:border-dourado md:min-h-10"
      >
        <SlidersHorizontal size={16} aria-hidden />
        Filtros
        {ativos > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-dourado px-1 text-[11px] font-bold text-carvao tabular-nums">{ativos}</span>
        )}
      </button>
      <Janela aberta={aberta} aoFechar={() => setAberta(false)} titulo="Filtros">
        <div
          className="flex flex-col gap-4"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button[type="submit"], a[href]')) setAberta(false);
          }}
        >
          {children}
        </div>
      </Janela>
    </>
  );
}
