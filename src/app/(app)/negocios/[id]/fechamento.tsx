"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { alterarStatus } from "@/lib/acoes/negocios";
import { avisoReabertura } from "@/lib/venda";

type Opcao = { id: string; nome: string };

const ROTULO_STATUS = { aberto: "Aberto", ganho: "Ganho", perdido: "Perdido" };

export function Fechamento({
  negocioId,
  status,
  motivos,
  somenteLeitura,
}: {
  negocioId: string;
  status: "aberto" | "ganho" | "perdido";
  motivos: Opcao[];
  /** SDR não pode marcar ganho/perdido (spec RAION_SDR_REGRAS_PERMISSOES §39) — só visualiza o status. */
  somenteLeitura?: boolean;
}) {
  const [resultado, acao, pendente] = useActionState(alterarStatus, null);
  const [perdendo, setPerdendo] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  if (somenteLeitura) {
    return <span className="text-sm text-texto-2">{ROTULO_STATUS[status]}</span>;
  }

  if (status !== "aberto") {
    if (reabrindo) {
      return (
        <form action={acao} onSubmit={() => setReabrindo(false)} className="flex flex-col gap-3">
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="status" value="aberto" />
          <AvisoReabertura status={status} />
          <div className="flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" onClick={() => setReabrindo(false)}>
              Voltar
            </Botao>
            <Botao type="submit" disabled={pendente}>
              Confirmar reabertura
            </Botao>
          </div>
        </form>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <Botao type="button" variante="secundario" disabled={pendente} onClick={() => setReabrindo(true)} className="w-fit">
          Reabrir negócio
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
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
          className="rounded-md border border-linha px-3 py-2 text-sm"
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

  // Só ícones, para o marco "Venda ganha" ter o mesmo peso dos outros marcos da jornada; o nome vai no
  // aria-label e na dica. Alvo de 44 px no celular, 36 px no computador.
  const classeIcone =
    "grid size-11 place-items-center rounded-full border bg-superficie transition-colors duration-200 ease-raion focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 md:size-9";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <form action={acao}>
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="status" value="ganho" />
          <button
            type="submit"
            disabled={pendente}
            aria-label="Marcar como ganho"
            title="Marcar como ganho"
            className={`${classeIcone} border-dourado/60 text-dourado-texto hover:bg-dourado hover:text-texto focus-visible:ring-dourado/50`}
          >
            <Check size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </form>
        <button
          type="button"
          onClick={() => setPerdendo(true)}
          aria-label="Marcar como perdido"
          title="Marcar como perdido"
          className={`${classeIcone} border-red-300 text-red-700 hover:bg-red-600 hover:text-white focus-visible:ring-red-400/50`}
        >
          <X size={18} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <Mensagem resultado={resultado} />
    </div>
  );
}

/** Texto da confirmação de reabertura. Reabrir não é cancelar a venda: nada é cancelado automaticamente. */
export function AvisoReabertura({ status }: { status: "ganho" | "perdido" }) {
  const aviso = avisoReabertura(status);
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">{aviso.titulo}</p>
      {aviso.linhas.map((linha) => (
        <p key={linha}>{linha}</p>
      ))}
    </div>
  );
}
