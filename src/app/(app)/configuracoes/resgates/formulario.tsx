"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { formatarDataHora } from "@/lib/formatacao";
import type { StatusResgate } from "@/lib/tipos";
import { StatusResgateGf } from "../../gamificacao/_compartilhado/resgate-ui";
import { formatarNumeroGf } from "../../gamificacao/_compartilhado/ui";
import { mudarStatusResgate } from "./actions";

export type ResgateLinha = {
  id: string;
  status: StatusResgate;
  moedasDebitadas: number;
  createdAt: string;
  recompensaNome: string;
  membroNome: string;
};

export function LinhaResgate({ resgate }: { resgate: ResgateLinha }) {
  const [resultado, acao, pendente] = useActionState(mudarStatusResgate, null);

  return (
    <form
      action={acao}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--gf-borda)] py-4 first:border-t-0 first:pt-0 last:pb-0"
    >
      <input type="hidden" name="id" value={resgate.id} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="gf-t-item break-words">{resgate.recompensaNome}</span>
        <span className="gf-t-aux break-words">
          {resgate.membroNome} · {formatarNumeroGf(resgate.moedasDebitadas)} moedas · {formatarDataHora(resgate.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusResgateGf status={resgate.status} />
        {resgate.status === "solicitado" && (
          <>
            <Botao type="submit" name="novoStatus" value="aprovado" variante="secundario" disabled={pendente}>
              Aprovar
            </Botao>
            <button type="submit" name="novoStatus" value="cancelado" disabled={pendente} className="gf-botao-texto">
              Cancelar
            </button>
          </>
        )}
        {resgate.status === "aprovado" && (
          <>
            <Botao type="submit" name="novoStatus" value="entregue" variante="secundario" disabled={pendente}>
              Marcar entregue
            </Botao>
            <button type="submit" name="novoStatus" value="cancelado" disabled={pendente} className="gf-botao-texto">
              Cancelar
            </button>
          </>
        )}
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
