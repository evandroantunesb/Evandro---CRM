"use client";

import { useActionState } from "react";
import { Gift } from "lucide-react";
import { resgatarRecompensa } from "../loja/actions";

/**
 * Versão no tema escuro da prévia de recompensa que aparece na Visão geral.
 * Mesma action/lógica de `CartaoRecompensa` (loja/formulario.tsx) — só o visual
 * muda. Layout horizontal compacto (ícone + nome + custo + ação numa linha),
 * pensado pra caber 2-3 lado a lado num cartão "Loja" denso. A Loja
 * (`/gamificacao/loja`) continua usando o componente original, ainda no tema
 * claro, até sua vez no redesign.
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
      className="flex flex-col gap-1.5 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] p-2.5"
    >
      <input type="hidden" name="recompensaId" value={recompensa.id} />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
          <Gift size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium text-[var(--gf-texto)]">
            {recompensa.nome}
          </span>
          <span className="text-xs font-semibold text-[var(--gf-dourado)]">
            {recompensa.custoMoedas.toLocaleString("pt-BR")} moedas
          </span>
        </div>
        <button
          type="submit"
          disabled={pendente || semSaldo}
          title={semSaldo ? "Moedas insuficientes" : "Resgatar"}
          className="shrink-0 rounded-lg border border-[var(--gf-borda)] px-2.5 py-1.5 text-xs font-medium text-[var(--gf-texto)] transition-colors hover:border-[var(--gf-verde)] disabled:opacity-50"
        >
          {semSaldo ? "—" : "Resgatar"}
        </button>
      </div>
      {resultado && (
        <p
          role="status"
          className={`rounded-lg px-2 py-1 text-[11px] ${resultado.ok ? "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]" : "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]"}`}
        >
          {resultado.mensagem}
        </p>
      )}
    </form>
  );
}
