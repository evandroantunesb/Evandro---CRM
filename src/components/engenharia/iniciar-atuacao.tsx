"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { iniciarAtuacaoEngenharia } from "@/lib/acoes/engenharia";

/** Botão "Iniciar atuação": assume a obra nova e leva ao card. Se outra pessoa iniciou antes, a mensagem explica. */
export function IniciarAtuacao({ obraId, rotulo }: { obraId: string; rotulo?: string }) {
  const [resultado, acao, pendente] = useActionState(iniciarAtuacaoEngenharia, null);
  return (
    <form action={acao} className="flex flex-col items-start gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <Botao type="submit" disabled={pendente} aria-label={rotulo}>
        {pendente ? "Iniciando..." : "Iniciar atuação"}
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
