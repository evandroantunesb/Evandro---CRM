"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { salvarPerfil } from "./actions";

export function FormularioPerfil({ nome, email }: { nome: string; email: string }) {
  const [resultado, acao, pendente] = useActionState(salvarPerfil, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo rotulo="Seu nome" name="nome" defaultValue={nome} required />
      <Campo rotulo="E-mail" value={email} disabled readOnly />
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={pendente}>
          Salvar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
