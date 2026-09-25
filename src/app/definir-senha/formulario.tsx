"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { definirSenha } from "./actions";

export function FormularioSenha({ nome }: { nome: string }) {
  const [resultado, acao, pendente] = useActionState(definirSenha, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Campo rotulo="Seu nome" name="nome" defaultValue={nome} required />
      <Campo rotulo="Nova senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      <Campo rotulo="Confirme a senha" name="confirmacao" type="password" autoComplete="new-password" required />
      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={pendente}>
        Salvar e entrar
      </Botao>
    </form>
  );
}
