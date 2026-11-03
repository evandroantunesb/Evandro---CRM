"use client";

import { useActionState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import type { MarcosTrajetoria } from "@/lib/engenharia-trajetoria";
import { salvarMarcos } from "./actions";

const entrada = `min-w-0 text-sm ${CLASSE_ENTRADA}`;

/** A cada quantas obras e kWp concluídos vem um marco na trajetória do engenheiro e da equipe. */
export function FormMarcos({ marcos }: { marcos: MarcosTrajetoria }) {
  const [resultado, acao, pendente] = useActionState(salvarMarcos, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      {(
        [
          ["obras", "Obras", "A cada quantas obras concluídas", "obras", 10000],
          ["kwp", "Potência", "A cada quantos kWp concluídos", "kWp", 100000],
        ] as const
      ).map(([nome, rotulo, ajuda, unidade, max]) => (
        <label key={nome} className="flex flex-col gap-1 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {rotulo}
            <span className="block text-xs text-zinc-500">{ajuda}</span>
          </span>
          <span className="flex items-center gap-2">
            <input
              name={nome}
              type="number"
              min={1}
              max={max}
              step={1}
              required
              defaultValue={marcos[nome]}
              aria-label={`Marco: ${ajuda[0].toLowerCase()}${ajuda.slice(1)}`}
              className={`${entrada} w-28`}
            />
            <span className="text-xs text-zinc-500">{unidade}</span>
          </span>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Salvar marcos
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
