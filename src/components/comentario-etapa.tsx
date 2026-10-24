"use client";

import { useState, useTransition } from "react";
import { Janela } from "@/components/janela";
import { Botao, CLASSE_ENTRADA, Selecao } from "@/components/ui";
import { moverEtapa } from "@/lib/acoes/negocios";

type Motivo = { id: string; nome: string };

/**
 * Popup obrigatório ao mover um negócio de etapa: pede um comentário curto sobre o que motivou
 * a mudança e salva como nota do negócio. Só fecha pelos botões (clicar fora e Esc não fecham),
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
    <Janela aberta aoFechar={aoCancelar} titulo={`Mover para “${etapaNome}”`} fechaSoPelosBotoes>
      {precisaMotivoPerda && (
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
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">{precisaMotivoPerda ? "Detalhes da perda" : "Comentário sobre a mudança de etapa"}</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          data-foco-inicial
          required
          className={`${CLASSE_ENTRADA} resize-none text-sm`}
        />
      </label>
      {erro && (
        <p role="alert" className="text-sm text-erro">
          {erro}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={pendente}>
          Cancelar
        </Botao>
        <Botao type="button" onClick={confirmar} disabled={pendente || !podeConfirmar}>
          {pendente ? "Movendo..." : "Mover"}
        </Botao>
      </div>
    </Janela>
  );
}
