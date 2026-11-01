"use client";

import { useActionState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { PERGUNTAS_ENQUADRAMENTO, textoCondicoes, type CondicoesItem } from "@/lib/engenharia-enquadramento-regras";
import { criarItemModelo, editarItemModelo, salvarCondicoesModelo } from "./actions";

const entrada = `min-w-0 text-sm ${CLASSE_ENTRADA}`;

export type ItemModelo = { id: string; grupo: string; titulo: string; obrigatorio: boolean; ordem: number; ativo: boolean; condicoes: CondicoesItem };

export function NovoItemModelo({ proximaOrdem }: { proximaOrdem: number }) {
  const [resultado, acao, pendente] = useActionState(criarItemModelo, null);
  return (
    <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input name="grupo" placeholder="Grupo (ex.: Equipamentos)" aria-label="Grupo" className={`${entrada} sm:w-56`} required maxLength={60} />
      <input name="titulo" placeholder="Ex.: Foto do padrão de entrada" aria-label="Título do item" className={`${entrada} flex-1`} required maxLength={160} />
      <input name="ordem" type="number" min={0} max={9999} defaultValue={proximaOrdem} aria-label="Ordem" className={`${entrada} w-24`} />
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="obrigatorio" defaultChecked /> Obrigatório
      </label>
      <Botao type="submit" disabled={pendente}>
        Criar item
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaItemModelo({ item }: { item: ItemModelo }) {
  return (
    <div className="flex flex-col gap-1 border-t border-zinc-100 py-2">
      <EditarItemModelo item={item} />
      <CondicoesItemModelo item={item} />
    </div>
  );
}

function EditarItemModelo({ item }: { item: ItemModelo }) {
  const [resultado, acao, pendente] = useActionState(editarItemModelo, null);
  return (
    <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input type="hidden" name="id" value={item.id} />
      <input name="grupo" defaultValue={item.grupo} aria-label="Grupo" className={`${entrada} sm:w-56`} required maxLength={60} />
      <input name="titulo" defaultValue={item.titulo} aria-label="Título" className={`${entrada} flex-1`} required maxLength={160} />
      <input name="ordem" type="number" min={0} max={9999} defaultValue={item.ordem} aria-label="Ordem" className={`${entrada} w-24`} />
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="obrigatorio" defaultChecked={item.obrigatorio} /> Obrigatório
      </label>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativo" defaultChecked={item.ativo} /> Ativo
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

/** Condições do item: fechado mostra o resumo ("Vale sempre" ou as respostas); aberto, as caixas por pergunta. */
function CondicoesItemModelo({ item }: { item: ItemModelo }) {
  const [resultado, acao, pendente] = useActionState(salvarCondicoesModelo, null);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-zinc-600">
        Condições: <span className="text-zinc-900">{textoCondicoes(item.condicoes)}</span>
      </summary>
      <form action={acao} className="mt-2 flex flex-col gap-3 rounded-lg border border-linha p-3">
        <input type="hidden" name="id" value={item.id} />
        <p className="text-xs text-zinc-500">Marque para quais respostas o item vale. Pergunta sem nada marcado não limita.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERGUNTAS_ENQUADRAMENTO.map((p) => (
            <fieldset key={p.chave} className="flex flex-col gap-1">
              <legend className="text-xs font-medium text-zinc-700">{p.rotulo}</legend>
              {p.opcoes.map((o) => (
                <label key={o.valor} className="flex items-center gap-1.5 text-zinc-700">
                  <input type="checkbox" name={p.chave} value={o.valor} defaultChecked={item.condicoes[p.chave]?.includes(o.valor) ?? false} />
                  {o.rotulo}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" variante="secundario" disabled={pendente}>
            Salvar condições
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </details>
  );
}
