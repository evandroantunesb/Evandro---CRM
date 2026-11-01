"use client";

import { useActionState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { MARCO_PRAZO, ROTULO_PRAZO, type ChavePrazo } from "@/lib/engenharia-prazos-regras";
import { adicionarFeriado, removerFeriado, salvarPrazos } from "./actions";

const entrada = `min-w-0 text-sm ${CLASSE_ENTRADA}`;

/** Dias úteis de cada prazo. Vazio = sem prazo. */
export function FormPrazos({ grupos }: { grupos: { titulo: string; ajuda: string; prazos: { chave: ChavePrazo; diasUteis: number | null }[] }[] }) {
  const [resultado, acao, pendente] = useActionState(salvarPrazos, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      {grupos.map((g) => (
        <fieldset key={g.titulo} className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-texto">{g.titulo}</legend>
          <p className="text-xs text-zinc-500">{g.ajuda}</p>
          {g.prazos.map((p) => (
            <label key={p.chave} className="flex flex-col gap-1 border-t border-zinc-100 pt-2 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {ROTULO_PRAZO[p.chave]}
                <span className="block text-xs text-zinc-500">Conta {MARCO_PRAZO[p.chave]}</span>
              </span>
              <span className="flex items-center gap-2">
                <input
                  name={p.chave}
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={p.diasUteis ?? ""}
                  placeholder="Sem prazo"
                  aria-label={`${ROTULO_PRAZO[p.chave]}: dias úteis`}
                  className={`${entrada} w-28`}
                />
                <span className="text-xs text-zinc-500">dias úteis</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Salvar prazos
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function NovoFeriado() {
  const [resultado, acao, pendente] = useActionState(adicionarFeriado, null);
  return (
    <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input name="data" type="date" aria-label="Data do feriado" className={`${entrada} sm:w-44`} required />
      <input name="nome" placeholder="Ex.: Aniversário de Cascavel" aria-label="Nome do feriado" className={`${entrada} flex-1`} required maxLength={80} />
      <Botao type="submit" disabled={pendente}>
        Adicionar feriado
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaFeriado({ feriado }: { feriado: { id: string; data: string; nome: string } }) {
  const [resultado, acao, pendente] = useActionState(removerFeriado, null);
  const [a, m, d] = feriado.data.split("-");
  return (
    <form action={acao} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-2 text-sm">
      <input type="hidden" name="id" value={feriado.id} />
      <span className="text-zinc-700">
        {d}/{m}/{a} · {feriado.nome}
      </span>
      <span className="flex items-center gap-2">
        {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Remover
        </Botao>
      </span>
    </form>
  );
}
