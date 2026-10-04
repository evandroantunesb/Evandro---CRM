"use client";

import { useActionState } from "react";
import { Gift } from "lucide-react";
import { resgatarRecompensa } from "../loja/actions";

/**
 * Versão no tema escuro da prévia de recompensa que aparece na Visão geral.
 * Mesma action/lógica de `CartaoRecompensa` (loja/formulario.tsx) — só o visual
 * muda. Linha enxuta (sem cartão/borda própria), pra a Loja fechar a coluna
 * lateral sem pesar mais que Metas/Conquistas, que são só texto/lista. A Loja
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
    <form action={acao} className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
          <Gift size={12} />
        </span>
        <input type="hidden" name="recompensaId" value={recompensa.id} />
        <span className="min-w-0 flex-1 truncate text-[var(--gf-texto)]">{recompensa.nome}</span>
        <span className="shrink-0 font-medium text-[var(--gf-dourado)]">
          {recompensa.custoMoedas.toLocaleString("pt-BR")}
        </span>
        <button
          type="submit"
          disabled={pendente || semSaldo}
          title={semSaldo ? "Moedas insuficientes" : "Resgatar"}
          className="shrink-0 text-[var(--gf-verde)] hover:underline disabled:text-[var(--gf-texto-ter)] disabled:no-underline"
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
