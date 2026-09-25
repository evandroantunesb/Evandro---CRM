"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { alterarStatus } from "@/lib/acoes/negocios";

type Opcao = { id: string; nome: string };

export function Fechamento({
  negocioId,
  status,
  motivos,
}: {
  negocioId: string;
  status: "aberto" | "ganho" | "perdido";
  motivos: Opcao[];
}) {
  const [resultado, acao, pendente] = useActionState(alterarStatus, null);
  const [perdendo, setPerdendo] = useState(false);

  if (status !== "aberto") {
    return (
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="negocioId" value={negocioId} />
        <input type="hidden" name="status" value="aberto" />
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Reabrir negócio
        </Botao>
        <Mensagem resultado={resultado} />
      </form>
    );
  }

  if (perdendo) {
    return (
      <form action={acao} className="flex flex-col gap-2">
        <input type="hidden" name="negocioId" value={negocioId} />
        <input type="hidden" name="status" value="perdido" />
        <Selecao rotulo="Motivo da perda" name="motivo_perda_id" required defaultValue="">
          <option value="" disabled>
            Escolha o motivo
          </option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
        <textarea
          name="motivo_perda_detalhe"
          rows={2}
          placeholder="Detalhes (opcional). Ex.: fechou com a empresa X por R$ 2 mil a menos"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" variante="perigo" disabled={pendente}>
            Confirmar perda
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => setPerdendo(false)}>
            Cancelar
          </Botao>
        </div>
        <Mensagem resultado={resultado} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={acao}>
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="status" value="ganho" />
          <Botao type="submit" disabled={pendente} className="bg-dourado text-carvao hover:bg-amber-400">
            Marcar como ganho
          </Botao>
        </form>
        <Botao type="button" variante="perigo" onClick={() => setPerdendo(true)}>
          Marcar como perdido
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </div>
  );
}
