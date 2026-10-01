"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { aceitarHandoff, devolverHandoff } from "@/lib/acoes/negocios";

/**
 * Estado do handoff pendente (spec aprovada pelo Evandro 2026-10-01): closer vê a
 * oportunidade aguardando aceite e decide — aceitar transfere o responsável pra ele,
 * devolver exige motivo e nunca reabre (um novo envio cria handoff novo).
 */
export function HandoffAceite({
  negocioId,
  handoffId,
  deNome,
  souCloser,
}: {
  negocioId: string;
  handoffId: string;
  deNome: string;
  souCloser: boolean;
}) {
  const [resultadoAceite, acaoAceitar, pendenteAceitar] = useActionState(aceitarHandoff, null);
  const [resultadoDevolucao, acaoDevolver, pendenteDevolver] = useActionState(devolverHandoff, null);
  const [devolvendo, setDevolvendo] = useState(false);

  if (!souCloser) {
    return (
      <div className="flex items-center gap-2">
        <Selo tom="atencao">Aguardando aceite</Selo>
        <span className="text-sm text-zinc-600">Enviado por {deNome}, esperando o vendedor aceitar.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Selo tom="atencao">Aguardando seu aceite</Selo>
        <span className="text-sm text-zinc-600">Enviado por {deNome}.</span>
      </div>
      {!devolvendo && (
        <div className="flex items-center gap-2">
          <form action={acaoAceitar}>
            <input type="hidden" name="handoffId" value={handoffId} />
            <input type="hidden" name="negocioId" value={negocioId} />
            <Botao type="submit" variante="primario" disabled={pendenteAceitar}>
              Aceitar
            </Botao>
          </form>
          <Botao type="button" variante="secundario" onClick={() => setDevolvendo(true)}>
            Devolver
          </Botao>
          {resultadoAceite && <Mensagem resultado={resultadoAceite} />}
        </div>
      )}
      {devolvendo && (
        <form action={acaoDevolver} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
          <input type="hidden" name="handoffId" value={handoffId} />
          <input type="hidden" name="negocioId" value={negocioId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Motivo da devolução</span>
            <textarea name="motivo" rows={2} required className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </label>
          <div className="flex items-center gap-2">
            <Botao type="submit" variante="primario" disabled={pendenteDevolver}>
              Confirmar devolução
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setDevolvendo(false)}>
              Cancelar
            </Botao>
            {resultadoDevolucao && <Mensagem resultado={resultadoDevolucao} />}
          </div>
        </form>
      )}
    </div>
  );
}
