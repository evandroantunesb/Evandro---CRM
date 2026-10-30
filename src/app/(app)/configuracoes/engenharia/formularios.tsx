"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { criarItemModelo, editarItemModelo } from "./actions";

const entrada = "min-w-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export type ItemModelo = { id: string; grupo: string; titulo: string; obrigatorio: boolean; ordem: number; ativo: boolean };

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
  const [resultado, acao, pendente] = useActionState(editarItemModelo, null);
  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 py-2 sm:flex-row sm:flex-wrap sm:items-center">
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
