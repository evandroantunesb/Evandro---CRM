"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { ROTULO_SETOR, SETORES_OBRA, STATUS_POR_SETOR, rotuloStatus } from "@/lib/obras/rotulos";
import { criarRegra, editarRegra } from "./actions";

const entrada = "min-w-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export type Regra = {
  id: string;
  gatilhoSetor: string;
  gatilhoStatus: string;
  setor: string;
  titulo: string;
  descricao: string | null;
  prazoDiasUteis: number;
  ativa: boolean;
};

function Campos({ regra }: { regra?: Regra }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Quando
        <select name="gatilho" defaultValue={regra ? `${regra.gatilhoSetor}:${regra.gatilhoStatus}` : ""} className={entrada} required>
          <option value="" disabled>
            Escolha o setor e o status
          </option>
          {SETORES_OBRA.map((s) => (
            <optgroup key={s} label={ROTULO_SETOR[s]}>
              {STATUS_POR_SETOR[s].map((st) => (
                <option key={st} value={`${s}:${st}`}>
                  {ROTULO_SETOR[s]} chegar a “{rotuloStatus(s, st)}”
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        Abrir tarefa para
        <select name="setor" defaultValue={regra?.setor ?? ""} className={entrada} required>
          <option value="" disabled>
            Escolha o setor
          </option>
          {SETORES_OBRA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SETOR[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
        Título da tarefa
        <input name="titulo" defaultValue={regra?.titulo} placeholder="Ex.: Agendar instalação com o cliente" className={entrada} required maxLength={160} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
        Descrição (opcional)
        <textarea name="descricao" defaultValue={regra?.descricao ?? ""} rows={2} className={entrada} maxLength={2000} />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        Prazo
        <input name="prazo" type="number" min={1} max={60} defaultValue={regra?.prazoDiasUteis ?? 2} className={`${entrada} w-20`} required />
        dias úteis
      </label>
    </div>
  );
}

export function NovaRegra() {
  const [resultado, acao, pendente] = useActionState(criarRegra, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campos />
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Criar regra
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaRegra({ regra }: { regra: Regra }) {
  const [resultado, acao, pendente] = useActionState(editarRegra, null);
  return (
    <form action={acao} className="flex flex-col gap-3 border-t border-zinc-100 py-3">
      <input type="hidden" name="id" value={regra.id} />
      <Campos regra={regra} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input type="checkbox" name="ativa" defaultChecked={regra.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
