"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import type { MembroResumo } from "@/lib/crm";
import { METRICAS_META, ROTULO_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import { apagarMeta, criarMeta, editarMeta } from "./actions";

export type MetaSalva = {
  id: string;
  titulo: string;
  metrica: MetricaMeta;
  membroId: string;
  periodoInicio: string;
  periodoFim: string;
  valorAlvo: number;
  ativa: boolean;
};

export function NovaMeta({ membros }: { membros: MembroResumo[] }) {
  const [resultado, acao, pendente] = useActionState(criarMeta, null);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Título" name="titulo" placeholder="Ex.: Meta de vendas de outubro" required />
        <Selecao rotulo="Colaborador" name="membroId" defaultValue="">
          <option value="" disabled>
            Escolha
          </option>
          {membros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Selecao rotulo="Métrica" name="metrica" defaultValue={METRICAS_META[0]}>
          {METRICAS_META.map((m) => (
            <option key={m} value={m}>
              {ROTULO_METRICA_META[m]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Meta a atingir" name="valorAlvo" type="number" min={0.01} step="0.01" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início do período" name="periodoInicio" type="date" required />
        <Campo rotulo="Fim do período" name="periodoFim" type="date" required />
      </div>
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente} className="self-start">
          Criar meta
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaMeta({ meta, membros }: { meta: MetaSalva; membros: MembroResumo[] }) {
  const [resultado, acao, pendente] = useActionState(editarMeta, null);

  return (
    <form action={acao} className="flex flex-col gap-3 border-t border-zinc-100 py-3 first:border-t-0">
      <input type="hidden" name="id" value={meta.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Título" name="titulo" defaultValue={meta.titulo} required />
        <Selecao rotulo="Colaborador" name="membroId" defaultValue={meta.membroId}>
          {membros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Selecao rotulo="Métrica" name="metrica" defaultValue={meta.metrica}>
          {METRICAS_META.map((m) => (
            <option key={m} value={m}>
              {ROTULO_METRICA_META[m]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Meta a atingir" name="valorAlvo" type="number" min={0.01} step="0.01" defaultValue={meta.valorAlvo} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início do período" name="periodoInicio" type="date" defaultValue={meta.periodoInicio} required />
        <Campo rotulo="Fim do período" name="periodoFim" type="date" defaultValue={meta.periodoFim} required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input type="checkbox" name="ativa" defaultChecked={meta.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarMeta} className="text-xs text-zinc-400 hover:text-red-700">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
