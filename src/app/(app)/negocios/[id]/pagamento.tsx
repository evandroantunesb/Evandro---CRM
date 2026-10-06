"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { confirmarPagamento, estornarConfirmacaoPagamento } from "@/lib/acoes/contratos";
import { ROTULO_STATUS_PAGAMENTO_CONTRATO, type StatusPagamentoContrato } from "@/lib/tipos";

/**
 * Pagamento confirmado (pedido do Evandro, 2026-10-01): marco operacional auditável,
 * separado do status do contrato. Só aparece com contrato assinado. Confirmar/estornar
 * são ações restritas a gestor/admin (bloqueadas no RPC, não só aqui) — por isso o botão
 * de ação só é mostrado a quem o papel permite; quem não pode, só vê o status.
 */
export function Pagamento({
  negocioId,
  contratoId,
  status,
  podeConfirmar,
}: {
  negocioId: string;
  contratoId: string;
  status: StatusPagamentoContrato;
  podeConfirmar: boolean;
}) {
  const [resultadoConfirmar, acaoConfirmar, confirmando] = useActionState(confirmarPagamento, null);
  const [resultadoEstornar, acaoEstornar] = useActionState(estornarConfirmacaoPagamento, null);
  const [estornando, setEstornando] = useState(false);

  const tom = status === "confirmado" ? "positivo" : status === "estornado" ? "negativo" : "atencao";

  return (
    <div className="flex flex-col gap-3">
      <Selo tom={tom}>{ROTULO_STATUS_PAGAMENTO_CONTRATO[status]}</Selo>

      {!podeConfirmar && status !== "confirmado" && (
        <p className="text-sm text-zinc-600">Só gestor ou admin pode confirmar o pagamento.</p>
      )}

      {podeConfirmar && (status === "pendente" || status === "estornado") && (
        <form action={acaoConfirmar} className="flex items-center gap-2">
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="contratoId" value={contratoId} />
          <Botao type="submit" variante="primario" disabled={confirmando}>
            Confirmar pagamento
          </Botao>
          {resultadoConfirmar && <Mensagem resultado={resultadoConfirmar} />}
        </form>
      )}

      {podeConfirmar && status === "confirmado" && !estornando && (
        <div className="flex items-center gap-2">
          <Botao type="button" variante="secundario" onClick={() => setEstornando(true)}>
            Estornar confirmação
          </Botao>
        </div>
      )}

      {podeConfirmar && status === "confirmado" && estornando && (
        <form action={acaoEstornar} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="contratoId" value={contratoId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Motivo do estorno</span>
            <textarea name="motivo" rows={2} required className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </label>
          <div className="flex items-center gap-2">
            <Botao type="submit" variante="primario">
              Confirmar estorno
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setEstornando(false)}>
              Cancelar
            </Botao>
            {resultadoEstornar && <Mensagem resultado={resultadoEstornar} />}
          </div>
        </form>
      )}
    </div>
  );
}
