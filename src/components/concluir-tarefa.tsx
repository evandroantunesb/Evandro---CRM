"use client";

import { useActionState, useState } from "react";
import { alternarConclusao } from "@/lib/acoes/tarefas";
import { Mensagem } from "@/components/ui";
import { RESULTADOS_POR_TIPO_TAREFA, ROTULO_RESULTADO_TAREFA, type TipoTarefa } from "@/lib/tipos";

const BOTAO_CHECKBOX = "mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs";

/**
 * Checkbox de concluir/reabrir tarefa. Ligação/WhatsApp e reunião/visita exigem escolher um
 * resultado antes de concluir (Evandro, 2026-10-01) — abre um seletor inline em vez de
 * concluir no mesmo clique; os demais tipos continuam com o clique único de sempre.
 */
export function ConcluirTarefa({ tarefaId, tipo, concluida }: { tarefaId: string; tipo: TipoTarefa; concluida: boolean }) {
  const [resultado, acaoConcluir, pendente] = useActionState(alternarConclusao, null);
  const [escolhendo, setEscolhendo] = useState(false);
  const resultadosValidos = RESULTADOS_POR_TIPO_TAREFA[tipo];

  if (concluida) {
    return (
      <form action={acaoConcluir}>
        <input type="hidden" name="tarefaId" value={tarefaId} />
        <input type="hidden" name="concluir" value="false" />
        <button aria-label="Marcar como pendente" className={`${BOTAO_CHECKBOX} border-green-600 bg-green-600 text-white`}>
          ✓
        </button>
      </form>
    );
  }

  if (!resultadosValidos) {
    return (
      <form action={acaoConcluir}>
        <input type="hidden" name="tarefaId" value={tarefaId} />
        <input type="hidden" name="concluir" value="true" />
        <button aria-label="Concluir tarefa" className={`${BOTAO_CHECKBOX} border-zinc-400 bg-white hover:border-green-600`} />
      </form>
    );
  }

  if (!escolhendo) {
    return (
      <button
        type="button"
        aria-label="Concluir tarefa"
        onClick={() => setEscolhendo(true)}
        className={`${BOTAO_CHECKBOX} border-zinc-400 bg-white hover:border-green-600`}
      />
    );
  }

  return (
    <form action={acaoConcluir} className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <input type="hidden" name="tarefaId" value={tarefaId} />
      <input type="hidden" name="concluir" value="true" />
      <select name="resultado" required defaultValue="" className="rounded border border-zinc-200 px-2 py-1 text-xs">
        <option value="" disabled>
          Qual foi o resultado?
        </option>
        {resultadosValidos.map((r) => (
          <option key={r} value={r}>
            {ROTULO_RESULTADO_TAREFA[r]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pendente} className="text-xs font-medium text-carvao hover:underline">
          Concluir
        </button>
        <button type="button" onClick={() => setEscolhendo(false)} className="text-xs text-zinc-500 hover:underline">
          Cancelar
        </button>
      </div>
      {resultado && <Mensagem resultado={resultado} />}
    </form>
  );
}
