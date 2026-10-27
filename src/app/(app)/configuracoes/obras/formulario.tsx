"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { ROTULO_SETOR, type SetorObra } from "@/lib/obras/rotulos";
import { salvarResponsavelPadraoObra } from "./actions";

export function FormularioResponsavelPadrao({ setor, atual, candidatos }: {
  setor: SetorObra;
  atual: string | null;
  candidatos: { id: string; nome: string }[];
}) {
  const [resultado, acao, pendente] = useActionState(salvarResponsavelPadraoObra, null);
  return <form action={acao} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-end">
    <input type="hidden" name="setor" value={setor} />
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-zinc-800">
      {ROTULO_SETOR[setor]}
      <Selecao name="membroId" defaultValue={atual ?? ""} aria-label={`Responsável padrão de ${ROTULO_SETOR[setor]}`}>
        <option value="">Sem responsável automático</option>
        {candidatos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </Selecao>
    </label>
    <Botao type="submit" variante="secundario" disabled={pendente}>
      {pendente ? "Salvando..." : "Salvar"}
    </Botao>
    <Mensagem resultado={resultado} />
  </form>;
}
