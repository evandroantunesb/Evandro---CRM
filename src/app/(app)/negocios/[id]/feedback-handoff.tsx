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
  feedback,
  autorNome,
}: {
  negocioId: string;
  handoffId: string;
  souAutor: boolean;
  feedback: string | null;
  autorNome: string | null;
}) {
  const [resultado, acao, pendente] = useActionState(registrarFeedbackHandoff, null);

  if (!souAutor) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-zinc-500">Visível só para admin/gestor — o SDR não tem acesso a este feedback.</p>
        {feedback ? (
          <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{feedback}</p>
        ) : (
          <p className="text-sm text-zinc-500">{autorNome ?? "O vendedor"} ainda não escreveu um feedback sobre este lead.</p>
        )}
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="handoffId" value={handoffId} />
      <input type="hidden" name="negocioId" value={negocioId} />
      <p className="text-xs text-zinc-500">Só o gestor vê este feedback — é uma métrica pra avaliar o trabalho do SDR.</p>
      <textarea
        name="feedback"
        rows={3}
        defaultValue={feedback ?? ""}
        placeholder="Como estava a qualidade deste lead? O contato foi correto, o cliente estava mesmo pronto, etc."
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
