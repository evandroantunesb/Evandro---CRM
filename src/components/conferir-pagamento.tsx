"use client";

import { useActionState, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { devolverAvisoPagamento } from "@/lib/acoes/avisos-pagamento";
import type { ResultadoAcao } from "@/lib/tipos";

/** Link para baixar o comprovante (URL assinada); sem URL, só o nome. */
export function LinkComprovante({ aviso }: { aviso: { comprovanteUrl: string | null; comprovanteNome: string } }) {
  return aviso.comprovanteUrl ? (
    <a href={aviso.comprovanteUrl} target="_blank" rel="noreferrer" className="text-dourado-texto underline-offset-2 hover:underline">
      {aviso.comprovanteNome}
    </a>
  ) : (
    <span>{aviso.comprovanteNome}</span>
  );
}

/**
 * Confere o pagamento informado pelo vendedor: confirma, ou devolve com motivo ("não encontrei o pagamento").
 * Usado na ficha (admin e gestor) e na lista "Pagamentos a confirmar" (também o Operacional); a RPC decide quem pode.
 */
export function ConferirPagamento({
  negocioId,
  contratoId,
  avisoId,
  acaoConfirmar,
}: {
  negocioId: string;
  contratoId: string;
  avisoId: string;
  acaoConfirmar: (estado: ResultadoAcao, formData: FormData) => Promise<ResultadoAcao>;
}) {
  const [resultadoConfirmar, confirmar, confirmando] = useActionState(acaoConfirmar, null);
  const [resultadoDevolver, devolver, devolvendo] = useActionState(devolverAvisoPagamento, null);
  const [motivoAberto, setMotivoAberto] = useState(false);

  if (motivoAberto) {
    return (
      <form action={devolver} className="flex flex-col gap-2">
        <input type="hidden" name="negocioId" value={negocioId} />
        <input type="hidden" name="avisoId" value={avisoId} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Por que não confirmou?</span>
          <textarea name="motivo" rows={3} required maxLength={500} className={CLASSE_ENTRADA} />
        </label>
        <span className="text-xs text-texto-2">O vendedor recebe um aviso com esse motivo e pode informar de novo.</span>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" disabled={devolvendo}>
            Devolver ao vendedor
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => setMotivoAberto(false)}>
            Voltar
          </Botao>
        </div>
        <Mensagem resultado={resultadoDevolver} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={confirmar}>
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="contratoId" value={contratoId} />
          <Botao type="submit" disabled={confirmando}>
            Confirmar pagamento
          </Botao>
        </form>
        <Botao type="button" variante="secundario" onClick={() => setMotivoAberto(true)}>
          Não encontrei o pagamento
        </Botao>
      </div>
      <Mensagem resultado={resultadoConfirmar} />
    </div>
  );
}
