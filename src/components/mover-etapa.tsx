"use client";

import { useState, useTransition } from "react";
import { moverEtapa } from "@/lib/acoes/negocios";

/**
 * Botão "Mover para »": alternativa ao arrastar no Kanban, essencial no celular
 * (onde arrastar cards é difícil) e útil na página do negócio pra trocar de etapa sem editar o card inteiro.
 */
export function MoverEtapa({
  negocioId,
  etapaAtualId,
  etapas,
  onMovido,
  compacto = false,
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: { id: string; nome: string }[];
  onMovido?: (etapaId: string) => void;
  compacto?: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const destinos = etapas.filter((e) => e.id !== etapaAtualId);
  if (!destinos.length) return null;

  function mover(etapaId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(negocioId, etapaId);
      if (r?.ok) onMovido?.(etapaId);
      else setErro(r?.mensagem ?? "Não foi possível mover.");
    });
  }

  return (
    <div className="inline-flex flex-col">
      <select
        aria-label="Mover para"
        disabled={pendente}
        defaultValue=""
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) mover(v);
        }}
        className={
          compacto
            ? "rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600 outline-none disabled:opacity-50"
            : "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-carvao outline-none hover:border-dourado disabled:opacity-50"
        }
      >
        <option value="" disabled>
          {pendente ? "Movendo..." : "Mover para »"}
        </option>
        {destinos.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
      {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
    </div>
  );
}
