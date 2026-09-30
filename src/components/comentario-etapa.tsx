"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao, Selecao } from "@/components/ui";
import { moverEtapa } from "@/lib/acoes/negocios";

type Motivo = { id: string; nome: string };

/**
 * Popup obrigatório ao mover um negócio de etapa: pede um comentário curto sobre o que motivou
 * a mudança e salva como nota do negócio. Só fecha pelo botão Cancelar (clicar fora não fecha),
 * pra não perder a mudança de etapa por engano antes do vendedor escrever algo.
 *
 * Quando a etapa de destino está configurada pra fechar o negócio como perdido (`etapas.fecha_como`),
 * o popup também exige o motivo da perda — o comentário digitado vira o detalhe da perda.
 */
export function ModalComentarioEtapa({
  negocioId,
  etapaId,
  etapaNome,
  precisaMotivoPerda = false,
  motivos = [],
  aoConcluir,
  aoCancelar,
}: {
  negocioId: string;
  etapaId: string;
  etapaNome: string;
  precisaMotivoPerda?: boolean;
  motivos?: Motivo[];
  aoConcluir: () => void;
  aoCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const podeConfirmar = texto.trim().length > 0 && (!precisaMotivoPerda || motivoId);

  function confirmar() {
    if (!podeConfirmar) return;
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(negocioId, etapaId, texto, precisaMotivoPerda ? motivoId : undefined);
      if (!r?.ok) {
        setErro(r?.mensagem ?? "Não foi possível mover.");
        return;
      }
      aoConcluir();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-titulo text-sm font-semibold text-carvao">Mover para &quot;{etapaNome}&quot;</h3>
          <button type="button" onClick={aoCancelar} aria-label="Cancelar" className="text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>
        {precisaMotivoPerda && (
          <div className="mb-2">
            <Selecao rotulo="Motivo da perda" value={motivoId} onChange={(e) => setMotivoId(e.target.value)} required>
              <option value="" disabled>
                Escolha o motivo
              </option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Selecao>
          </div>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          autoFocus
          required
          placeholder={precisaMotivoPerda ? "Detalhes da perda" : "Comentário sobre a mudança de etapa"}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={pendente}>
            Cancelar
          </Botao>
          <Botao type="button" onClick={confirmar} disabled={pendente || !podeConfirmar}>
            {pendente ? "Movendo..." : "Mover"}
          </Botao>
        </div>
      </div>
    </div>
  );
}
