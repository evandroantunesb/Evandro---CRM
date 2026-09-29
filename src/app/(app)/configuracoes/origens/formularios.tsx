"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { criarOrigem, editarOrigem } from "./actions";

const inputClasse = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovaOrigem() {
  const [resultado, acao, pendente] = useActionState(criarOrigem, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input name="nome" placeholder="Ex.: Feira Solar 2026" className={inputClasse} required />
      <input name="cor" type="color" defaultValue="#f59e0b" aria-label="Cor" className="h-9 w-12 rounded border border-zinc-300" />
      <Botao type="submit" disabled={pendente}>
        Criar origem
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaOrigem({
  origem,
}: {
  origem: { id: string; nome: string; cor: string | null; ativa: boolean; prazoAutoAprovacaoMinutos: number };
}) {
  const [resultado, acao, pendente] = useActionState(editarOrigem, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2">
      <input type="hidden" name="id" value={origem.id} />
      <input
        name="cor"
        type="color"
        defaultValue={origem.cor ?? "#a1a1aa"}
        aria-label="Cor"
        className="h-8 w-10 rounded border border-zinc-300"
      />
      <input name="nome" defaultValue={origem.nome} aria-label="Nome" className={inputClasse} required />
      <label className="flex items-center gap-1 text-sm text-zinc-700" title="Depois desse tempo sem o gestor decidir, o lead é atribuído sozinho pro vendedor sugerido pelo rodízio.">
        Auto-aprovação em
        <input
          name="prazo_auto_aprovacao_minutos"
          type="number"
          min={1}
          max={10080}
          defaultValue={origem.prazoAutoAprovacaoMinutos}
          aria-label="Prazo de auto-aprovação (minutos)"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
        min
      </label>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativa" defaultChecked={origem.ativa} /> Ativa
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
