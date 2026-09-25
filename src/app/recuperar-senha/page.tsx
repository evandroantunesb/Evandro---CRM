"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { TelaPublica } from "@/components/tela-publica";
import { pedirRecuperacao } from "./actions";

export default function RecuperarSenha() {
  const [resultado, acao, pendente] = useActionState(pedirRecuperacao, null);
  return (
    <TelaPublica titulo="Recuperar senha">
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
    </TelaPublica>
  );
}
