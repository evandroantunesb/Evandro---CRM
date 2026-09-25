"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { criarEtiqueta, criarMotivo, editarEtiqueta, editarMotivo } from "./actions";

const inputClasse = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovoItem({ tipo }: { tipo: "etiqueta" | "motivo" }) {
  const [resultado, acao, pendente] = useActionState(tipo === "etiqueta" ? criarEtiqueta : criarMotivo, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);
  return (
    <form ref={form} action={acao} className="flex flex-wrap items-center gap-2">
      <input
        name="nome"
        placeholder={tipo === "etiqueta" ? "Ex.: Cliente quente, Empresa, Rural" : "Ex.: Comprou só o gerador"}
        className={inputClasse}
        required
      />
      {tipo === "etiqueta" && (
        <input name="cor" type="color" defaultValue="#2563eb" aria-label="Cor" className="h-9 w-12 rounded border border-zinc-300" />
      )}
      <Botao type="submit" disabled={pendente}>
        {tipo === "etiqueta" ? "Criar etiqueta" : "Criar motivo"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaItem({
  tipo,
  item,
}: {
  tipo: "etiqueta" | "motivo";
  item: { id: string; nome: string; cor?: string | null; ativo: boolean };
}) {
  const [resultado, acao, pendente] = useActionState(tipo === "etiqueta" ? editarEtiqueta : editarMotivo, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 first:border-t-0">
      <input type="hidden" name="id" value={item.id} />
      {tipo === "etiqueta" && (
        <input
          name="cor"
          type="color"
          defaultValue={item.cor ?? "#71717a"}
          aria-label="Cor"
          className="h-8 w-10 rounded border border-zinc-300"
        />
      )}
      <input name="nome" defaultValue={item.nome} aria-label="Nome" className={inputClasse} required />
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
