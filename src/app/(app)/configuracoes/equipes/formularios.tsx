"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { adicionarNaEquipe, criarEquipe } from "./actions";

export function FormularioEquipe() {
  const [resultado, acao, pendente] = useActionState(criarEquipe, null);
  return (
    <form action={acao} className="flex flex-col gap-2 md:flex-row md:items-end">
      <div className="flex-1">
        <Campo rotulo="Nome da equipe" name="nome" placeholder="Ex.: Equipe Maringá" required />
      </div>
      <Botao type="submit" disabled={pendente}>
        Criar equipe
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function FormularioAdicionar({
  equipeId,
  candidatos,
}: {
  equipeId: string;
  candidatos: { id: string; nome: string }[];
}) {
  const [resultado, acao, pendente] = useActionState(adicionarNaEquipe, null);
  if (!candidatos.length) return <p className="text-sm text-zinc-500">Todos os usuários ativos já estão nesta equipe.</p>;
  return (
    <form action={acao} className="flex flex-col gap-2 md:flex-row md:items-center">
      <input type="hidden" name="equipeId" value={equipeId} />
      <Selecao name="membroId" aria-label="Pessoa" defaultValue="">
        <option value="" disabled>
          Adicionar pessoa...
        </option>
        {candidatos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="e_gestor" /> Gestor da equipe
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Adicionar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
