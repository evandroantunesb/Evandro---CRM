"use client";

import { useActionState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { ETAPAS_OBRA, ROTULO_ETAPA_CURTO, type ChavePrazoObra } from "@/lib/obras/cronograma";
import { salvarPrazosObra } from "./actions";

function Linha({ chave, rotulo, ajuda, dias }: { chave: ChavePrazoObra; rotulo: string; ajuda?: string; dias: number | undefined }) {
  return (
    <label className="flex flex-col gap-1 border-t border-zinc-100 pt-2 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
      <span>
        {rotulo}
        {ajuda && <span className="block text-xs text-zinc-500">{ajuda}</span>}
      </span>
      <span className="flex items-center gap-2">
        <input
          name={chave}
          type="number"
          min={1}
          max={365}
          required
          defaultValue={dias}
          aria-label={`${rotulo}: dias úteis`}
          className={`min-w-0 text-sm ${CLASSE_ENTRADA} w-28`}
        />
        <span className="text-xs text-zinc-500">dias úteis</span>
      </span>
    </label>
  );
}

/** Dias úteis de cada etapa (em sequência, da chegada da obra) e da entrega contratada. */
export function FormularioPrazosObra({ prazos }: { prazos: Partial<Record<ChavePrazoObra, number>> }) {
  const [resultado, acao, pendente] = useActionState(salvarPrazosObra, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-texto">Etapas</legend>
        <p className="text-xs text-zinc-500">Cada etapa começa quando a anterior termina. Uma etapa que atrasa empurra as seguintes.</p>
        {ETAPAS_OBRA.map((e) => (
          <Linha key={e} chave={e} rotulo={ROTULO_ETAPA_CURTO[e]} dias={prazos[e]} />
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-texto">Entrega ao cliente</legend>
        <Linha
          chave="entrega_contratada"
          rotulo="Entrega contratada"
          ajuda="Conta da chegada da obra. Vale para as obras novas; o gestor ajusta a data de cada obra."
          dias={prazos.entrega_contratada}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Salvar prazos
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
