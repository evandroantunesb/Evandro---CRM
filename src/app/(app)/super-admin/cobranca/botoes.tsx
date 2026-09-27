"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui";
import { fecharMes, marcarPago } from "./actions";

export function BotaoFecharMes({ empresaId, referencia }: { empresaId: string; referencia: string }) {
  const [resultado, acao, pendente] = useActionState(fecharMes, null);
  if (resultado?.ok) return <span className="text-xs text-zinc-500">Fechado</span>;
  return (
    <form action={acao} className="flex flex-col items-start gap-1">
      <input type="hidden" name="empresaId" value={empresaId} />
      <input type="hidden" name="referencia" value={referencia} />
      <Botao type="submit" variante="secundario" disabled={pendente} className="px-2! py-1! text-xs">
        {pendente ? "Fechando..." : "Fechar mês"}
      </Botao>
      {resultado && !resultado.ok && <span className="text-xs text-red-700">{resultado.mensagem}</span>}
    </form>
  );
}

export function BotaoMarcarPago({ fechamentoId }: { fechamentoId: string }) {
  const [resultado, acao, pendente] = useActionState(marcarPago, null);
  if (resultado?.ok) return <span className="text-xs text-zinc-500">Pago</span>;
  return (
    <form action={acao} className="flex flex-col items-start gap-1">
      <input type="hidden" name="fechamentoId" value={fechamentoId} />
      <Botao type="submit" variante="secundario" disabled={pendente} className="px-2! py-1! text-xs">
        {pendente ? "Marcando..." : "Marcar pago"}
      </Botao>
      {resultado && !resultado.ok && <span className="text-xs text-red-700">{resultado.mensagem}</span>}
    </form>
  );
}
