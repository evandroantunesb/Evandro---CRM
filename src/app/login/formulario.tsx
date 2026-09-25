"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { entrar } from "./actions";

export function FormularioLogin() {
  const [resultado, acao, pendente] = useActionState(entrar, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Entrando..." : "Entrar"}
      </Botao>
      <Link href="/recuperar-senha" className="text-center text-sm text-zinc-600 hover:underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
