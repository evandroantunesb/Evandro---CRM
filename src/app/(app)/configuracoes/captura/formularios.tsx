"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { criarFormulario } from "./actions";

export function NovoFormulario({
  funis,
  origens,
}: {
  funis: { id: string; nome: string }[];
  origens: { id: string; nome: string }[];
}) {
  const [resultado, acao, pendente] = useActionState(criarFormulario, null);
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2">
      <input name="nome" placeholder="Ex.: Formulário do site" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" required />
      <Selecao name="funil_id" defaultValue="" required>
        <option value="" disabled>
          Funil
        </option>
        {funis.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </Selecao>
      <Selecao name="origem_id" defaultValue="" required>
        <option value="" disabled>
          Origem
        </option>
        {origens.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" disabled={pendente}>
        Criar formulário
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
