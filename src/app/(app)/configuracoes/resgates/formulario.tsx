"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/formatacao";
import { ROTULO_STATUS_RESGATE, type StatusResgate } from "@/lib/tipos";
import { mudarStatusResgate } from "./actions";

export type ResgateLinha = {
  id: string;
  status: StatusResgate;
  pontosDebitados: number;
  createdAt: string;
  recompensaNome: string;
  membroNome: string;
};

const TOM_STATUS: Record<StatusResgate, "neutro" | "positivo" | "negativo" | "atencao"> = {
  solicitado: "atencao",
  aprovado: "neutro",
  entregue: "positivo",
  cancelado: "negativo",
};

export function LinhaResgate({ resgate }: { resgate: ResgateLinha }) {
  const [resultado, acao, pendente] = useActionState(mudarStatusResgate, null);

  return (
    <form action={acao} className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 py-3 first:border-t-0">
      <input type="hidden" name="id" value={resgate.id} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-zinc-900">
          {resgate.membroNome} · {resgate.recompensaNome}
        </span>
        <span className="text-xs text-zinc-500">
          {resgate.pontosDebitados.toLocaleString("pt-BR")} pts · {formatarDataHora(resgate.createdAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Selo tom={TOM_STATUS[resgate.status]}>{ROTULO_STATUS_RESGATE[resgate.status]}</Selo>
        {resgate.status === "solicitado" && (
          <>
            <Botao type="submit" name="novoStatus" value="aprovado" variante="secundario" disabled={pendente}>
              Aprovar
            </Botao>
            <button type="submit" name="novoStatus" value="cancelado" disabled={pendente} className="text-xs text-zinc-400 hover:text-red-700">
              Cancelar
            </button>
          </>
        )}
        {resgate.status === "aprovado" && (
          <>
            <Botao type="submit" name="novoStatus" value="entregue" variante="secundario" disabled={pendente}>
              Marcar entregue
            </Botao>
            <button type="submit" name="novoStatus" value="cancelado" disabled={pendente} className="text-xs text-zinc-400 hover:text-red-700">
              Cancelar
            </button>
          </>
        )}
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
