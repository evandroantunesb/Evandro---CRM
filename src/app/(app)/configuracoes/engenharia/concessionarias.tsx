"use client";

import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { distribuidoraDoTexto } from "@/lib/tarifa-gd";
import { criarConcessionaria, renomearConcessionaria } from "./acoes-concessionarias";

const entrada = `min-w-0 text-sm ${CLASSE_ENTRADA}`;

/**
 * Nova concessionária (só o admin): distribuidora da lista da ANEEL (digite para buscar), nome que a equipe vê e o ponto
 * de partida (cópia da Copel ou vazia). Mostra quantas obras sem concessionária citam a distribuidora escolhida.
 */
export function NovaConcessionaria({
  distribuidoras,
  jaCadastradas,
  obrasSemConcessionaria,
  temCopel,
  voltar,
}: {
  /** Sigla → rótulo curto (`rotulosDistribuidoras`). */
  distribuidoras: [string, string][];
  jaCadastradas: string[];
  obrasSemConcessionaria: Record<string, number>;
  temCopel: boolean;
  voltar: string;
}) {
  const id = useId();
  const [resultado, acao, pendente] = useActionState(criarConcessionaria, null);
  const rotulos = useMemo(() => new Map(distribuidoras), [distribuidoras]);
  const [texto, setTexto] = useState("");
  const [nome, setNome] = useState("");
  const sigla = distribuidoraDoTexto(texto, rotulos);
  const conhecida = rotulos.has(sigla);
  const obras = conhecida ? (obrasSemConcessionaria[sigla] ?? 0) : 0;

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="distribuidora" value={sigla} />
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Distribuidora (lista da ANEEL, digite para buscar)
        <input
          list={`${id}-aneel`}
          required
          value={texto}
          onChange={(e) => {
            const novo = e.target.value;
            const s = distribuidoraDoTexto(novo, rotulos);
            if (!nome || nome === rotulos.get(sigla)) setNome(rotulos.get(s) ?? "");
            setTexto(novo);
          }}
          className={entrada}
        />
        <datalist id={`${id}-aneel`}>
          {distribuidoras
            .filter(([s]) => !jaCadastradas.includes(s))
            .map(([s, r]) => (
              <option key={s} value={r} label={s} />
            ))}
        </datalist>
      </label>
      {texto && !conhecida && <p className="text-sm text-amber-900">Escolha uma distribuidora da lista.</p>}
      {conhecida && jaCadastradas.includes(sigla) && <p className="text-sm text-amber-900">Esta distribuidora já tem concessionária na empresa.</p>}
      {obras > 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {obras === 1 ? "1 obra sem concessionária cita" : `${obras} obras sem concessionária citam`} esta distribuidora no negócio.
          Depois de criar, a Engenharia escolhe a concessionária em cada obra.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Nome que a equipe vê
        <input name="nome" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} className={entrada} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-zinc-600">Começar com</legend>
        <label className="flex items-start gap-3 rounded-lg border border-linha p-3 text-sm">
          <input type="radio" name="base" value="copel" defaultChecked={temCopel} disabled={!temCopel} className="mt-1" />
          <span>
            <span className="font-medium text-texto">Cópia da Copel</span>
            <span className="block text-xs text-zinc-600">Checklist, prazos da distribuidora e canais da Copel, para o técnico ajustar.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-linha p-3 text-sm">
          <input type="radio" name="base" value="vazia" defaultChecked={!temCopel} className="mt-1" />
          <span>
            <span className="font-medium text-texto">Vazia</span>
            <span className="block text-xs text-zinc-600">
              Sem itens, sem prazos e sem canais. O checklist das obras dela fica vazio até alguém cadastrar.
            </span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente || !conhecida}>
          {pendente ? "Criando..." : "Criar concessionária"}
        </Botao>
        <Link href={voltar} className="text-sm text-zinc-600 underline hover:text-zinc-900">
          Cancelar
        </Link>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/** Troca o nome que a equipe vê (a distribuidora não muda). Só o admin. */
export function RenomearConcessionaria({ id, nome }: { id: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [resultado, acao, pendente] = useActionState(renomearConcessionaria, null);
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs text-zinc-600 underline hover:text-zinc-900">
        Trocar o nome
      </button>
    );
  }
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-600">
        Nome que a equipe vê
        <input name="nome" required minLength={2} maxLength={60} defaultValue={nome} className={entrada} />
      </label>
      <Botao type="submit" disabled={pendente}>
        Salvar
      </Botao>
      <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
        Cancelar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
