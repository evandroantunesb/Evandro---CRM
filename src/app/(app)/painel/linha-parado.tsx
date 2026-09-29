"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Mensagem, Selecao, Selo } from "@/components/ui";
import { tempoDesde } from "@/lib/formatacao";
import { reatribuirResponsavel } from "./actions";
import type { MembroResumo } from "@/lib/crm";

export function LinhaParado({
  negocioId,
  numero,
  titulo,
  contatoNome,
  responsavelId,
  ultimaAtividadeEm,
  agora,
  vendedores,
}: {
  negocioId: string;
  numero: number;
  titulo: string;
  contatoNome: string;
  responsavelId: string | null;
  ultimaAtividadeEm: string;
  agora: number;
  vendedores: MembroResumo[];
}) {
  const [resultado, acao, pendente] = useActionState(reatribuirResponsavel, null);

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <Link href={`/negocios/${negocioId}`} className="truncate text-sm font-medium text-zinc-900 hover:underline">
          {contatoNome}
        </Link>
        <p className="truncate text-xs text-zinc-500">
          #{numero} {titulo}
        </p>
      </div>
      <Selo tom="atencao">{tempoDesde(ultimaAtividadeEm, agora)}</Selo>
      <form action={acao} className="flex items-center gap-2">
        <input type="hidden" name="negocioId" value={negocioId} />
        <Selecao key={responsavelId} name="responsavelId" defaultValue={responsavelId ?? ""}>
          <option value="" disabled>
            Reatribuir...
          </option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id} disabled={v.id === responsavelId}>
              {v.nome}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario" disabled={pendente} className="text-xs">
          Reatribuir
        </Botao>
      </form>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </li>
  );
}
