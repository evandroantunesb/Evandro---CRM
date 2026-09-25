"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { criarNota } from "@/lib/acoes/notas";

export function NovaNota({ negocioId }: { negocioId: string }) {
  const [resultado, acao, pendente] = useActionState(criarNota, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);

  return (
    <form ref={form} action={acao} className="mb-3 flex flex-col gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <textarea
        name="texto"
        rows={2}
        required
        placeholder="Escreva uma nota: o que o cliente disse, próximos passos..."
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar nota
        </Botao>
        {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
      </div>
    </form>
  );
}
