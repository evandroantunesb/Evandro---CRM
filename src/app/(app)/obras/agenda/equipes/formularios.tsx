"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarEquipeInstalacao } from "@/lib/acoes/agenda";
import type { EquipeInstalacao } from "@/lib/obras/agenda";

const entrada = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovaEquipe() {
  const [resultado, acao, pendente] = useActionState(salvarEquipeInstalacao, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input name="nome" placeholder="Nome da equipe" aria-label="Nome da equipe" className={entrada} required minLength={2} maxLength={80} />
      <input name="telefone" placeholder="Telefone (opcional)" aria-label="Telefone" className={entrada} maxLength={30} inputMode="tel" />
      <Botao type="submit" disabled={pendente}>
        Cadastrar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaEquipe({ equipe }: { equipe: EquipeInstalacao }) {
  const [resultado, acao, pendente] = useActionState(salvarEquipeInstalacao, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2">
      <input type="hidden" name="id" value={equipe.id} />
      <input name="nome" defaultValue={equipe.nome} aria-label="Nome da equipe" className={entrada} required minLength={2} maxLength={80} />
      <input name="telefone" defaultValue={equipe.telefone ?? ""} aria-label="Telefone" className={entrada} maxLength={30} inputMode="tel" />
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativa" value="true" defaultChecked={equipe.ativa} /> Ativa
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
