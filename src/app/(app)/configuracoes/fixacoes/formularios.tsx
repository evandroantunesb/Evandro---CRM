"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { criarFixacao, editarFixacao } from "./actions";

const inputClasse = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovaFixacao() {
  const [resultado, acao, pendente] = useActionState(criarFixacao, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input name="nome" placeholder="Ex.: Gancho para telha cerâmica" aria-label="Nome da opção" className={inputClasse} required maxLength={80} />
      <Botao type="submit" disabled={pendente}>
        Criar opção
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaFixacao({ fixacao }: { fixacao: { id: string; nome: string; ativa: boolean } }) {
  const [resultado, acao, pendente] = useActionState(editarFixacao, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2">
      <input type="hidden" name="id" value={fixacao.id} />
      <input name="nome" defaultValue={fixacao.nome} aria-label="Nome" className={inputClasse} required maxLength={80} />
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativa" defaultChecked={fixacao.ativa} /> Ativa
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
