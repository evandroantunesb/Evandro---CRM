"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { marcarNotificacaoLida } from "@/lib/acoes/notificacoes";
import type { Notificacao } from "@/lib/notificacoes";
import type { LinkPendencias } from "@/lib/pendencias";

/**
 * Bell do menu: se há notificação individual não lida, abre um dropdown com elas; senão mostra
 * os links de pendências (admin/gestor: leads a distribuir e demais pendências separados).
 */
export function Sininho({ notificacoes, pendencias }: { notificacoes: Notificacao[]; pendencias: LinkPendencias[] }) {
  if (notificacoes.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        {pendencias.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-offwhite hover:border-dourado"
          >
            <Bell size={16} />
            {p.texto}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-offwhite hover:border-dourado">
        <Bell size={16} />
        {notificacoes.length} notificaç{notificacoes.length === 1 ? "ão" : "ões"}
      </summary>
      <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-1 text-carvao shadow-lg">
        {notificacoes.map((n) => (
          <form key={n.id} action={marcarNotificacaoLida} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-zinc-50">
            <input type="hidden" name="id" value={n.id} />
            {n.link ? (
              <Link href={n.link} className="flex-1 hover:underline">
                {n.mensagem}
              </Link>
            ) : (
              <span className="flex-1">{n.mensagem}</span>
            )}
            <button type="submit" className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700" title="Marcar como lida">
              ✕
            </button>
          </form>
        ))}
        {pendencias.map((p) => (
          <Link key={p.href} href={p.href} className="block rounded-md p-2 text-xs text-zinc-500 hover:bg-zinc-50 hover:underline">
            {p.texto}
          </Link>
        ))}
      </div>
    </details>
  );
}
