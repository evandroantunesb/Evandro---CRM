"use client";

import { useActionState } from "react";
import { Gift } from "lucide-react";
import { resgatarRecompensa } from "../loja/actions";

/**
 * Versão no tema escuro da prévia de recompensa que aparece na Visão geral.
 * Mesma action/lógica de `CartaoRecompensa` (loja/formulario.tsx) — só o visual
 * muda. A Loja (`/gamificacao/loja`) continua usando o componente original,
 * ainda no tema claro, até sua vez no redesign.
 */
export function CartaoRecompensaGf({
  recompensa,
  saldo,
}: {
  recompensa: { id: string; nome: string; descricao: string; custoMoedas: number };
  saldo: number;
}) {
  const [resultado, acao, pendente] = useActionState(resgatarRecompensa, null);
  const semSaldo = saldo < recompensa.custoMoedas;

  return (
    <form
      action={acao}
      className="flex flex-col gap-2 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] p-3"
    >
      <input type="hidden" name="recompensaId" value={recompensa.id} />
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
          <Gift size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--gf-texto)]">
          {recompensa.nome}
        </span>
      </div>
      {recompensa.descricao && (
        <span className="text-xs text-[var(--gf-texto-sec)]">{recompensa.descricao}</span>
      )}
      <span className="text-sm font-semibold text-[var(--gf-dourado)]">
        {recompensa.custoMoedas.toLocaleString("pt-BR")} moedas
      </span>
      <button
        type="submit"
        disabled={pendente || semSaldo}
        className="self-start rounded-lg border border-[var(--gf-borda)] px-3 py-1.5 text-sm font-medium text-[var(--gf-texto)] transition-colors hover:border-[var(--gf-verde)] disabled:opacity-50"
      >
        {semSaldo ? "Moedas insuficientes" : "Resgatar"}
      </button>
      {resultado && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-xs ${resultado.ok ? "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]" : "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]"}`}
        >
          {resultado.mensagem}
        </p>
      )}
    </form>
  );
}
