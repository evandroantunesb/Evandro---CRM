"use client";

import { useActionState } from "react";
import { enviarCaptura } from "@/lib/acoes/captura";
import { Botao, Campo, Mensagem } from "@/components/ui";

export function FormularioCaptura({ token }: { token: string }) {
  const [resultado, acao, pendente] = useActionState(enviarCaptura, null);

  if (resultado?.ok) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{resultado.mensagem}</div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Campo rotulo="Nome" name="nome" required />
      <Campo rotulo="Telefone (WhatsApp)" name="telefone" type="tel" required />
      <Campo rotulo="E-mail (opcional)" name="email" type="email" />
      <Campo rotulo="Cidade (opcional)" name="cidade" />
      <Campo rotulo="Número da unidade consumidora (opcional)" name="unidade_consumidora" />
      <Botao type="submit" disabled={pendente} className="mt-2">
        {pendente ? "Enviando..." : "Quero uma proposta"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
