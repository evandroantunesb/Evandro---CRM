"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { decidirAtribuicaoLead } from "./actions";
import type { AtribuicaoPendente } from "@/lib/painel";
import type { MembroResumo } from "@/lib/crm";

export function LinhaAtribuicaoPendente({
  atribuicao,
  minutosRestantes,
  vendedores,
}: {
  atribuicao: AtribuicaoPendente;
  minutosRestantes: number;
  vendedores: MembroResumo[];
}) {
  const [resultado, acao, pendente] = useActionState(decidirAtribuicaoLead, null);

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 text-sm">
      <input type="hidden" name="id" value={atribuicao.id} />
      <a href={`/negocios/${atribuicao.negocioId}`} className="min-w-0 flex-1 truncate font-medium text-zinc-900 hover:text-dourado">
        #{atribuicao.negocioNumero} {atribuicao.contatoNome}
      </a>
      <span className="text-xs text-zinc-500">
        {minutosRestantes > 0 ? `auto-aprova em ${minutosRestantes} min` : "auto-aprovação a qualquer momento"}
      </span>
      <Selecao name="membro_final_id" defaultValue={atribuicao.membroSugeridoId}>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id === atribuicao.membroSugeridoId ? `${v.nome} (sugerido)` : v.nome}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Atribuir
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
