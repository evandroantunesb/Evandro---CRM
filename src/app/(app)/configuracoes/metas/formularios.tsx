"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import type { MembroResumo } from "@/lib/crm";
import { METRICAS_META, ROTULO_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import { CabecalhoItemGf, StatusAtivoGf } from "../../gamificacao/_compartilhado/formulario-ui";
import { BadgeGf } from "../../gamificacao/_compartilhado/ui";
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
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
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
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Selecao rotulo="Métrica" name="metrica" defaultValue={METRICAS_META[0]}>
          {METRICAS_META.map((m) => (
            <option key={m} value={m}>
              {ROTULO_METRICA_META[m]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Meta a atingir" name="valorAlvo" type="number" min={0.01} step="0.01" required />
      </div>
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <Campo rotulo="Início do período" name="periodoInicio" type="date" required />
        <Campo rotulo="Fim do período" name="periodoFim" type="date" required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={pendente} className="self-start">
          Criar meta
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaMeta({ meta, membros, nomeColaborador }: { meta: MetaSalva; membros: MembroResumo[]; nomeColaborador?: string }) {
  const [resultado, acao, pendente] = useActionState(editarMeta, null);

  return (
    <form action={acao} className="gf-item-edicao flex flex-col gap-4">
      <input type="hidden" name="id" value={meta.id} />
      <CabecalhoItemGf titulo={meta.titulo}>
        {nomeColaborador && <BadgeGf>{nomeColaborador}</BadgeGf>}
        <BadgeGf tom="positivo">{ROTULO_METRICA_META[meta.metrica]}</BadgeGf>
        <StatusAtivoGf ativa={meta.ativa} />
      </CabecalhoItemGf>
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <Campo rotulo="Título" name="titulo" defaultValue={meta.titulo} required />
        <Selecao rotulo="Colaborador" name="membroId" defaultValue={meta.membroId}>
          {membros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Selecao rotulo="Métrica" name="metrica" defaultValue={meta.metrica}>
          {METRICAS_META.map((m) => (
            <option key={m} value={m}>
              {ROTULO_METRICA_META[m]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Meta a atingir" name="valorAlvo" type="number" min={0.01} step="0.01" defaultValue={meta.valorAlvo} required />
      </div>
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <Campo rotulo="Início do período" name="periodoInicio" type="date" defaultValue={meta.periodoInicio} required />
        <Campo rotulo="Fim do período" name="periodoFim" type="date" defaultValue={meta.periodoFim} required />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
        <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
          <input type="checkbox" name="ativa" defaultChecked={meta.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarMeta} className="gf-botao-texto sm:ml-auto">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
