"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { registrarFeedbackHandoff } from "@/lib/acoes/negocios";

/**
 * Feedback do vendedor sobre o lead recebido via handoff (pedido do Evandro 2026-09-30).
 * Visível só a quem a página já filtrou: o próprio vendedor que recebeu (escreve) ou
 * admin/gestor (só leem) — nunca o SDR. Sem botão de recusa: recusa é sempre manual,
 * comunicada ao gestor fora do app.
 */
export function FeedbackHandoff({
  negocioId,
  handoffId,
  souAutor,
  jaContatouLead,
  feedback,
  autorNome,
}: {
  negocioId: string;
  handoffId: string;
  souAutor: boolean;
  jaContatouLead: boolean;
  feedback: string | null;
  autorNome: string | null;
}) {
  const [resultado, acao, pendente] = useActionState(registrarFeedbackHandoff, null);

  if (!souAutor) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-texto-2">Visível só para admin/gestor — o SDR não tem acesso a este feedback.</p>
        {feedback ? (
          <p className="whitespace-pre-wrap rounded-lg border border-linha bg-superficie-2 p-3 text-sm text-texto-2">{feedback}</p>
        ) : (
          <p className="text-sm text-texto-2">{autorNome ?? "O vendedor"} ainda não escreveu um feedback sobre este lead.</p>
        )}
      </div>
    );
  }

  if (!jaContatouLead && !feedback) {
    return (
      <p className="text-sm text-texto-2">
        Registre uma nota do contato com o lead (em &quot;Notas e linha do tempo&quot;) pra liberar o feedback aqui.
      </p>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="handoffId" value={handoffId} />
      <input type="hidden" name="negocioId" value={negocioId} />
      <p className="text-xs text-texto-2">Só o gestor vê este feedback — é uma métrica pra avaliar o trabalho do SDR.</p>
      <textarea
        name="feedback"
        rows={3}
        defaultValue={feedback ?? ""}
        placeholder="Como estava a qualidade deste lead? O contato foi correto, o cliente estava mesmo pronto, etc."
        className="rounded-lg border border-linha px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar feedback
        </Botao>
        {resultado && <Mensagem resultado={resultado} />}
      </div>
    </form>
  );
}
