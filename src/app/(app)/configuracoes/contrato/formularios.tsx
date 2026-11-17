"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import type { ResultadoAcao } from "@/lib/tipos";

/** Texto de um modelo com `{{campos}}` (contrato, procuração); a ação de salvar vem da página. */
export function FormularioModelo({
  conteudoInicial,
  salvar,
  exemplo,
}: {
  conteudoInicial: string;
  salvar: (anterior: ResultadoAcao, formData: FormData) => Promise<ResultadoAcao>;
  exemplo: string;
}) {
  const [resultado, acao, pendente] = useActionState(salvar, null);
  // Controlado: se o salvamento for recusado (campo desconhecido), o texto digitado não se perde.
  const [conteudo, setConteudo] = useState(conteudoInicial);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <textarea
        name="conteudo"
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={16}
        placeholder={exemplo}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20"
      />
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Salvar modelo
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
