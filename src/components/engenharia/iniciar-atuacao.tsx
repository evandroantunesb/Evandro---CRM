"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";
import { CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { Botao, Mensagem } from "@/components/ui";
import { iniciarAtuacaoEngenharia } from "@/lib/acoes/engenharia";

/**
 * Botão "Iniciar atuação": assume a obra nova e leva ao card. Se outra pessoa iniciou antes, a mensagem explica.
 * `naFaixa`: botão dourado da faixa do início da Engenharia ("Iniciar próxima obra da fila").
 */
export function IniciarAtuacao({ obraId, rotulo, naFaixa = false }: { obraId: string; rotulo?: string; naFaixa?: boolean }) {
  const [resultado, acao, pendente] = useActionState(iniciarAtuacaoEngenharia, null);
  return (
    <form action={acao} className="flex flex-col items-start gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      {naFaixa ? (
        <button type="submit" disabled={pendente} aria-label={rotulo} className={`${CLASSE_ACAO_CABECALHO} disabled:opacity-70`}>
          <Play size={16} aria-hidden />
          {pendente ? "Iniciando..." : "Iniciar próxima obra da fila"}
        </button>
      ) : (
        <Botao type="submit" disabled={pendente} aria-label={rotulo}>
          {pendente ? "Iniciando..." : "Iniciar atuação"}
        </Botao>
      )}
      {resultado && !resultado.ok && (
        <span className={naFaixa ? "rounded-lg bg-offwhite px-2 py-1" : undefined}>
          <Mensagem resultado={resultado} />
        </span>
      )}
    </form>
  );
}
