"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { criarTarefa } from "@/lib/acoes/tarefas";
import { ROTULO_TIPO_TAREFA, TIPOS_TAREFA } from "@/lib/tipos";

type Opcao = { id: string; nome: string };

/** Próxima hora cheia, no formato do campo datetime-local (horário de Brasília). */
function proximaHora() {
  const d = new Date(Date.now() + 3600e3 - 3 * 3600e3);
  return d.toISOString().slice(0, 13) + ":00";
}

export function NovaTarefa({
  negocioId,
  responsaveis,
  responsavelPadrao,
}: {
  negocioId?: string;
  responsaveis: Opcao[];
  responsavelPadrao?: string | null;
}) {
  const [resultado, acao, pendente] = useActionState(criarTarefa, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);

  return (
    <form ref={form} action={acao} className="flex flex-col gap-2">
      {negocioId && <input type="hidden" name="negocioId" value={negocioId} />}
      <input
        name="titulo"
        placeholder="O que precisa ser feito? Ex.: ligar para confirmar a visita"
        required
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Selecao name="tipo" defaultValue="ligacao" aria-label="Tipo">
          {TIPOS_TAREFA.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_TAREFA[t]}
            </option>
          ))}
        </Selecao>
        <input
          type="datetime-local"
          name="vence_em"
          defaultValue={proximaHora()}
          required
          aria-label="Prazo"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {responsaveis.length > 0 && (
          <Selecao name="responsavel_id" defaultValue={responsavelPadrao ?? ""} aria-label="Responsável pela tarefa">
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        )}
        <Botao type="submit" disabled={pendente}>
          Criar tarefa
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
