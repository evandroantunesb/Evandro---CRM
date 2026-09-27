"use client";

import { ChevronDown, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { moverEtapa } from "@/lib/acoes/negocios";
import { ItemMenuSuspenso, MenuSuspenso, RotuloMenuSuspenso } from "@/components/menu-suspenso";

/**
 * Menu "Mover para": alternativa ao arrastar no Kanban, essencial no celular
 * (onde arrastar cards é difícil) e útil na página do negócio pra trocar de etapa sem editar o card inteiro.
 * No card do Kanban (compacto) também abre o negócio, pra deixar claro onde editar.
 */
export function MoverEtapa({
  negocioId,
  etapaAtualId,
  etapas,
  compacto = false,
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: { id: string; nome: string }[];
  compacto?: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const destinos = etapas.filter((e) => e.id !== etapaAtualId);

  function mover(etapaId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(negocioId, etapaId);
      if (!r?.ok) setErro(r?.mensagem ?? "Não foi possível mover.");
    });
  }

  if (!destinos.length && !compacto) return null;

  return (
    <div className="inline-flex flex-col">
      <MenuSuspenso
        trigger={({ alternar }) =>
          compacto ? (
            <button
              type="button"
              aria-label="Opções do negócio"
              disabled={pendente}
              onClick={alternar}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            >
              <MoreVertical size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={pendente}
              onClick={alternar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-carvao transition-colors hover:border-dourado disabled:opacity-50"
            >
              {pendente ? "Movendo..." : "Mover para"}
              <ChevronDown size={14} />
            </button>
          )
        }
      >
        {compacto && (
          <>
            <Link href={`/negocios/${negocioId}`} className="block px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              Abrir negócio
            </Link>
            {destinos.length > 0 && <div className="my-1 border-t border-zinc-100" />}
          </>
        )}
        {destinos.length > 0 && (
          <>
            {compacto && <RotuloMenuSuspenso>Mover para</RotuloMenuSuspenso>}
            {destinos.map((e) => (
              <ItemMenuSuspenso key={e.id} onClick={() => mover(e.id)} disabled={pendente}>
                {e.nome}
              </ItemMenuSuspenso>
            ))}
          </>
        )}
      </MenuSuspenso>
      {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
    </div>
  );
}
