"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { PAPEIS, ROTULO_PAPEL, ROTULO_TIPO_VENDEDOR, TIPOS_VENDEDOR, type Papel, type TipoVendedor } from "@/lib/tipos";
import { atualizarMembro, convidarMembro } from "./actions";

export function FormularioConvite() {
  const [resultado, acao, pendente] = useActionState(convidarMembro, null);
  const [papel, setPapel] = useState<Papel>("vendedor");
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Nome" name="nome" required />
      <Campo rotulo="E-mail" name="email" type="email" required />
      <Selecao rotulo="Perfil" name="papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
        {PAPEIS.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Tipo de vendedor" name="tipo_vendedor" disabled={papel !== "vendedor"} defaultValue="interno">
        {TIPOS_VENDEDOR.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_VENDEDOR[t]}
          </option>
        ))}
      </Selecao>
      {papel !== "vendedor" && <input type="hidden" name="tipo_vendedor" value="interno" />}
      <div className="flex flex-col gap-2 md:col-span-2">
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={pendente} className="self-start">
          {pendente ? "Enviando..." : "Enviar convite"}
        </Botao>
      </div>
    </form>
  );
}

export type MembroLinha = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  tipoVendedor: TipoVendedor | null;
  recebeLeads: boolean;
  ativo: boolean;
};

export function LinhaMembro({ membro }: { membro: MembroLinha }) {
  const [resultado, acao, pendente] = useActionState(atualizarMembro, null);
  const [papel, setPapel] = useState<Papel>(membro.papel);
  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 py-3 md:flex-row md:items-center">
      <input type="hidden" name="membroId" value={membro.id} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">{membro.nome || "(sem nome)"}</p>
        <p className="truncate text-sm text-zinc-500">{membro.email}</p>
      </div>
      <Selecao name="papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} aria-label="Perfil">
        {PAPEIS.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </Selecao>
      <Selecao
        name="tipo_vendedor"
        defaultValue={membro.tipoVendedor ?? "interno"}
        disabled={papel !== "vendedor"}
        aria-label="Tipo de vendedor"
      >
        {TIPOS_VENDEDOR.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_VENDEDOR[t]}
          </option>
        ))}
      </Selecao>
      {papel !== "vendedor" && <input type="hidden" name="tipo_vendedor" value="interno" />}
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="recebe_leads" defaultChecked={membro.recebeLeads} /> Recebe leads
      </label>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativo" defaultChecked={membro.ativo} /> Ativo
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
