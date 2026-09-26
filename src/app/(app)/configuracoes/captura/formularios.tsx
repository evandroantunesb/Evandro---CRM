"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { criarFormulario, criarOrigemRapida } from "./actions";

export function NovoFormulario({
  funis,
  origens,
}: {
  funis: { id: string; nome: string }[];
  origens: { id: string; nome: string }[];
}) {
  const [resultado, acao, pendente] = useActionState(criarFormulario, null);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo rotulo="Nome do formulário" name="nome" placeholder="Ex.: Formulário do site" required />
      <div className="flex flex-wrap items-end gap-2">
        <Selecao rotulo="Funil" name="funil_id" defaultValue="" required>
          <option value="" disabled>
            Escolha o funil
          </option>
          {funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Origem" name="origem_id" defaultValue="" required>
          <option value="" disabled>
            Escolha a origem
          </option>
          {origens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Selecao>
        <NovaOrigemRapida />
      </div>
      <Botao type="submit" disabled={pendente} className="self-start">
        Criar formulário
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function NovaOrigemRapida() {
  const [aberto, setAberto] = useState(false);
  const [resultado, acao, pendente] = useActionState(criarOrigemRapida, null);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:border-dourado hover:text-carvao"
      >
        + Nova origem
      </button>
    );
  }

  if (resultado?.ok) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700">
        {resultado.mensagem}
        <button type="button" onClick={() => setAberto(false)} className="text-zinc-500 hover:text-zinc-700">
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={acao} className="flex items-end gap-2">
        <input
          name="nome"
          placeholder="Nome da origem"
          className="min-w-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          required
        />
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Adicionar
        </Botao>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-zinc-500 hover:text-zinc-700">
          Cancelar
        </button>
      </form>
      <Mensagem resultado={resultado} />
    </div>
  );
}
