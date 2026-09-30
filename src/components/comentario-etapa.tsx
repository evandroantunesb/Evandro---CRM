"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { moverEtapa } from "@/lib/acoes/negocios";

/**
 * Popup obrigatório ao mover um negócio de etapa: pede um comentário curto sobre o que motivou
 * a mudança (ex.: "liguei para o cliente, pediu um orçamento") e salva como nota do negócio.
 */
export function ModalComentarioEtapa({
  negocioId,
  etapaId,
  etapaNome,
  aoConcluir,
  aoCancelar,
}: {
  negocioId: string;
  etapaId: string;
  etapaNome: string;
  aoConcluir: () => void;
  aoCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmar() {
    if (!texto.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(negocioId, etapaId, texto);
      if (!r?.ok) {
        setErro(r?.mensagem ?? "Não foi possível mover.");
        return;
      }
      aoConcluir();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={aoCancelar}>
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-titulo text-sm font-semibold text-carvao">Mover para &quot;{etapaNome}&quot;</h3>
          <button type="button" onClick={aoCancelar} aria-label="Cancelar" className="text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          Conte o que motivou a mudança (ex.: &quot;liguei para o cliente, pediu um orçamento&quot;).
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          autoFocus
          required
          placeholder="Comentário sobre a mudança de etapa"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao type="button" onClick={confirmar} disabled={pendente || !texto.trim()}>
            {pendente ? "Movendo..." : "Mover"}
          </Botao>
        </div>
      </div>
    </div>
  );
}
