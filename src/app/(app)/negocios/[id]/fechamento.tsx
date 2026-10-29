"use client";

import { Check, ChevronDown, MoreHorizontal } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Janela } from "@/components/janela";
import { ItemMenuSuspenso, MenuSuspenso } from "@/components/menu-suspenso";
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
  principal = true,
}: {
  negocioId: string;
  status: "aberto" | "ganho" | "perdido";
  motivos: Opcao[];
  /** SDR não pode marcar ganho/perdido (spec RAION_SDR_REGRAS_PERMISSOES §39) — só visualiza o status. */
  somenteLeitura?: boolean;
  /** "Marcar como ganho" é a ação principal da barra; falso quando já há um próximo passo em destaque. */
  principal?: boolean;
}) {
  const [resultado, acao, pendente] = useActionState(alterarStatus, null);
  const [, iniciar] = useTransition();
  const [perdendo, setPerdendo] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  if (somenteLeitura) {
    return <span className="text-sm text-zinc-700">{ROTULO_STATUS[status]}</span>;
  }

  if (status !== "aberto") {
    if (reabrindo) {
      return (
        <Janela aberta aoFechar={() => setReabrindo(false)} titulo="Reabrir o negócio" fechaSoPelosBotoes>
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
        </Janela>
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
      <Janela aberta aoFechar={() => setPerdendo(false)} titulo="Marcar como perdido" fechaSoPelosBotoes>
        <form action={acao} className="flex flex-col gap-3">
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="status" value="perdido" />
          <Selecao rotulo="Motivo da perda" name="motivo_perda_id" required defaultValue="" data-foco-inicial>
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
            rows={3}
            placeholder="Detalhes (opcional). Ex.: fechou com a empresa X por R$ 2 mil a menos"
            className="rounded-md border border-linha bg-superficie px-3 py-2 text-sm text-texto"
          />
          <Mensagem resultado={resultado} />
          <div className="flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" onClick={() => setPerdendo(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" variante="perigo" disabled={pendente}>
              Confirmar perda
            </Botao>
          </div>
        </form>
      </Janela>
    );
  }

  function marcarGanho() {
    const dados = new FormData();
    dados.set("negocioId", negocioId);
    dados.set("status", "ganho");
    iniciar(() => acao(dados));
  }

  const itensMenu = (
    <>
      {!principal && <ItemMenuSuspenso onClick={marcarGanho}>Marcar como ganho</ItemMenuSuspenso>}
      <ItemMenuSuspenso onClick={() => setPerdendo(true)}>Marcar como perdido</ItemMenuSuspenso>
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {principal ? (
          <>
            <button
              type="button"
              onClick={marcarGanho}
              disabled={pendente}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-acao px-5 text-sm font-semibold text-sobre-acao transition-colors hover:bg-acao-forte disabled:opacity-50 sm:flex-none md:min-h-10"
            >
              <Check size={16} strokeWidth={2.5} aria-hidden />
              {pendente ? "Salvando..." : "Marcar como ganho"}
            </button>
            <MenuSuspenso
              trigger={({ alternar }) => (
                <button
                  type="button"
                  aria-label="Mais ações de fechamento"
                  aria-haspopup="menu"
                  onClick={alternar}
                  className="grid size-11 place-items-center rounded-full border border-linha text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto md:size-10"
                >
                  <MoreHorizontal size={18} aria-hidden />
                </button>
              )}
            >
              {itensMenu}
            </MenuSuspenso>
          </>
        ) : (
          <MenuSuspenso
            trigger={({ alternar }) => (
              <button
                type="button"
                aria-haspopup="menu"
                onClick={alternar}
                disabled={pendente}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-linha px-4 text-sm font-medium text-texto transition-colors hover:border-dourado disabled:opacity-50 md:min-h-10"
              >
                Fechar negócio
                <ChevronDown size={14} aria-hidden />
              </button>
            )}
          >
            {itensMenu}
          </MenuSuspenso>
        )}
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
