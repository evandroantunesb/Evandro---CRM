"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hrefObra, type NavegacaoObra } from "@/lib/obras/navegacao";

/**
 * Barra de navegação entre obras: Anterior / Próxima, "Obra X de N" e seletor para saltar.
 * Reutilizável pelos modos Gestão e Apresentação (muda só `base`). A lista vem pronta do
 * servidor (empresa atual + RLS + filtros da URL); aqui só se monta o endereço de cada obra.
 * Setas ← → do teclado navegam, exceto com o foco em campo de texto ou seletor.
 */
export function NavegacaoObras({
  navegacao,
  atualId,
  base,
  query,
  rotuloLista = "Voltar para a lista",
}: {
  navegacao: NavegacaoObra;
  atualId: string;
  base: string;
  query: string;
  rotuloLista?: string;
}) {
  const router = useRouter();
  const { itens, posicao, total, anteriorId, proximaId } = navegacao;
  const href = (id: string) => hrefObra(base, id, query);
  const hrefLista = `/obras${query ? `?${query}` : ""}`;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft" && anteriorId) router.push(hrefObra(base, anteriorId, query));
      if (e.key === "ArrowRight" && proximaId) router.push(hrefObra(base, proximaId, query));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [anteriorId, proximaId, base, query, router]);

  const botao =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-carvao transition-colors hover:border-dourado";
  const desativado = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-100 bg-zinc-50 px-3 text-sm text-zinc-400";

  return (
    <nav aria-label="Navegação entre obras" className="flex flex-col gap-2 rounded-xl border border-zinc-200/80 bg-white p-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {anteriorId ? (
          <Link href={href(anteriorId)} className={botao} aria-label="Obra anterior" rel="prev">
            ‹ <span className="ml-1 hidden sm:inline">Anterior</span>
          </Link>
        ) : (
          <span className={desativado} aria-disabled="true">
            ‹ <span className="ml-1 hidden sm:inline">Anterior</span>
          </span>
        )}
        <p className="min-w-24 flex-1 text-center text-sm text-zinc-700 sm:flex-none" aria-live="polite">
          {posicao != null ? (
            <>
              Obra <span className="font-semibold text-zinc-900">{posicao}</span> de {total}
            </>
          ) : (
            <span className="text-zinc-500">Fora da lista filtrada ({total})</span>
          )}
        </p>
        {proximaId ? (
          <Link href={href(proximaId)} className={botao} aria-label="Próxima obra" rel="next">
            <span className="mr-1 hidden sm:inline">Próxima</span> ›
          </Link>
        ) : (
          <span className={desativado} aria-disabled="true">
            <span className="mr-1 hidden sm:inline">Próxima</span> ›
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {total > 0 && (
          <select
            aria-label="Ir para a obra"
            value={posicao != null ? atualId : ""}
            onChange={(e) => e.target.value && router.push(href(e.target.value))}
            className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-carvao outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20 sm:w-64"
          >
            {posicao == null && (
              <option value="" disabled>
                Ir para a obra...
              </option>
            )}
            {itens.map((i, n) => (
              <option key={i.id} value={i.id}>
                {n + 1}. {i.rotulo}
              </option>
            ))}
          </select>
        )}
        <Link href={hrefLista} className="shrink-0 text-sm whitespace-nowrap text-zinc-600 underline hover:text-zinc-900">
          {rotuloLista}
        </Link>
      </div>
    </nav>
  );
}
