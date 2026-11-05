"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { pedirRecuperacao } from "./actions";

export function FormularioRecuperacao() {
  const [resultado, acao, pendente] = useActionState(pedirRecuperacao, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Campo rotulo="E-mail" name="email" type="email" required />
      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={pendente}>
        Enviar link
      </Botao>
      <Link href="/login" className="text-center text-sm text-zinc-600 hover:underline">
        Voltar para o login
      </Link>
    </form>
  );
}
