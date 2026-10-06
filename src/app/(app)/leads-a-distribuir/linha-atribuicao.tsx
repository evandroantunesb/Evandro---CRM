"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { decidirAtribuicaoLead } from "./actions";
import type { MembroResumo } from "@/lib/crm";
import type { AtribuicaoPendente } from "@/lib/distribuicao-leads";

/**
 * Uma linha da fila. `candidatos` = vendedores e SDRs ativos (candidatosDistribuicao);
 * `padrao` = sugerido pelo rodízio quando ainda é candidato, ou vazio — nesse caso o select
 * começa em "Escolha o responsável" e é obrigatório, para nunca atribuir em silêncio ao
 * primeiro da lista.
 */
export function LinhaAtribuicaoPendente({
  atribuicao,
  minutosRestantes,
  candidatos,
  padrao,
}: {
  atribuicao: AtribuicaoPendente;
  minutosRestantes: number;
  candidatos: MembroResumo[];
  padrao: string;
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
      <Selecao name="membro_final_id" defaultValue={padrao} required aria-label="Responsável">
        {!padrao && (
          <option value="" disabled>
            Escolha o responsável
          </option>
        )}
        {candidatos.map((c) => (
          <option key={c.id} value={c.id}>
            {`${c.nome}${c.papel === "sdr" ? " · SDR" : ""}${c.id === atribuicao.membroSugeridoId ? " (sugerido)" : ""}`}
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
