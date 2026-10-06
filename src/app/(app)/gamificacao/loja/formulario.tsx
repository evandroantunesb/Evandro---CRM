"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { resgatarRecompensa } from "./actions";

export function CartaoRecompensa({
  recompensa,
  saldo,
}: {
  recompensa: { id: string; nome: string; descricao: string; custoMoedas: number };
  saldo: number;
}) {
  const [resultado, acao, pendente] = useActionState(resgatarRecompensa, null);
  const semSaldo = saldo < recompensa.custoMoedas;

  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <input type="hidden" name="recompensaId" value={recompensa.id} />
      <span className="text-sm font-medium text-zinc-900">{recompensa.nome}</span>
      {recompensa.descricao && <span className="text-xs text-zinc-500">{recompensa.descricao}</span>}
      <span className="text-sm font-semibold text-dourado">{recompensa.custoMoedas.toLocaleString("pt-BR")} moedas</span>
      <Botao type="submit" variante="secundario" disabled={pendente || semSaldo} className="self-start">
        {semSaldo ? "Moedas insuficientes" : "Resgatar"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
