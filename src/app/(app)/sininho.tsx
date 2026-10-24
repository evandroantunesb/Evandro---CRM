"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Janela } from "@/components/janela";
import { marcarNotificacaoLida } from "@/lib/acoes/notificacoes";
import type { Notificacao } from "@/lib/notificacoes";
import type { LinkPendencias } from "@/lib/pendencias";

type Avisos = { notificacoes: Notificacao[]; pendencias: LinkPendencias[] };

// Linha discreta, integrada ao sidebar (não compete com os itens do menu); leads a distribuir
// ganham só um leve destaque dourado.
const LINHA = "flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors";
const LINHA_NEUTRA = `${LINHA} border-white/[0.06] text-offwhite/60 hover:bg-white/[0.04] hover:text-offwhite`;
const LINHA_DESTAQUE = `${LINHA} border-dourado/20 text-offwhite/80 hover:bg-white/[0.04] hover:text-offwhite`;

/** Notificações (cada uma pode ser marcada como lida) seguidas dos links de pendências, nas cores do tema. */
function ListaAvisos({ notificacoes, pendencias, aoNavegar }: Avisos & { aoNavegar?: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      {notificacoes.map((n) => (
        <form key={n.id} action={marcarNotificacaoLida} className="flex items-start gap-1 rounded-xl text-sm text-texto">
          <input type="hidden" name="id" value={n.id} />
          {n.link ? (
            <Link href={n.link} onClick={aoNavegar} className="min-h-11 flex-1 rounded-xl px-3 py-2.5 hover:bg-superficie-2">
              {n.mensagem}
            </Link>
          ) : (
            <span className="flex-1 px-3 py-2.5">{n.mensagem}</span>
          )}
          <button
            type="submit"
            aria-label="Marcar como lida"
            title="Marcar como lida"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-texto-2 hover:bg-superficie-2 hover:text-texto"
          >
            <X size={15} />
          </button>
        </form>
      ))}
      {pendencias.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          onClick={aoNavegar}
          className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm text-texto-2 hover:bg-superficie-2 hover:text-texto"
        >
          {p.texto}
        </Link>
      ))}
    </div>
  );
}

/**
 * Avisos na barra lateral (computador): se há notificação individual não lida, abre uma lista com
 * elas; senão mostra os links de pendências (admin/gestor: leads a distribuir e demais separados).
 */
export function Sininho({ notificacoes, pendencias }: Avisos) {
  if (notificacoes.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        {pendencias.map((p) => {
          const destaque = p.href === "/leads-a-distribuir";
          return (
            <Link key={p.href} href={p.href} className={destaque ? LINHA_DESTAQUE : LINHA_NEUTRA}>
              <Bell size={14} strokeWidth={1.75} className={destaque ? "text-dourado" : ""} />
              {p.texto}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <details className="group relative">
      <summary className={`${LINHA_DESTAQUE} cursor-pointer list-none`}>
        <Bell size={14} strokeWidth={1.75} className="text-dourado" />
        {notificacoes.length} notificaç{notificacoes.length === 1 ? "ão" : "ões"}
      </summary>
      <div className="painel absolute top-full left-0 z-20 mt-2 w-80 p-1.5">
        <ListaAvisos notificacoes={notificacoes} pendencias={pendencias} />
      </div>
    </details>
  );
}

/** Sino do cabeçalho do celular: o número soma notificações e pendências; toque abre a janela de avisos. */
export function BotaoAvisos({ notificacoes, pendencias, total }: Avisos & { total: number }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={total > 0 ? `Avisos (${total})` : "Avisos"}
        className="relative grid h-11 w-11 place-items-center rounded-full text-offwhite/80 transition-colors hover:bg-white/[0.06] hover:text-offwhite"
      >
        <Bell size={20} strokeWidth={1.75} />
        {total > 0 && (
          <span className="absolute top-1.5 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-dourado px-1 text-[10px] leading-none font-bold text-carvao tabular-nums">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      <Janela aberta={aberta} aoFechar={() => setAberta(false)} titulo="Avisos">
        <ListaAvisos notificacoes={notificacoes} pendencias={pendencias} aoNavegar={() => setAberta(false)} />
      </Janela>
    </>
  );
}
