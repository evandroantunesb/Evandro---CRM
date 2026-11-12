"use client";

import { useState, useTransition } from "react";
import { Botao, CLASSE_ENTRADA, FOCO } from "@/components/ui";
import { gerarNovoLink } from "@/lib/acoes/obra-solo";

/** Cartão "Link de acompanhamento" do quadro "SoloChecklist": copiar e gerar um novo (o antigo para de funcionar). */
export function LinkCliente({ obraId, link, primeiroNome }: { obraId: string; link: string | null; primeiroNome: string }) {
  const [atual, setAtual] = useState(link);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <section className="painel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">O que o cliente vê</p>
          <h2 className="font-titulo text-[17px] font-semibold text-texto">Link de acompanhamento</h2>
        </div>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            if (!confirm("Gerar um novo link? O link antigo para de funcionar.")) return;
            iniciar(async () => {
              const r = await gerarNovoLink(obraId);
              setAviso(r.mensagem);
              if (r.ok) setAtual(r.link);
            });
          }}
          className={`rounded text-sm font-medium text-dourado-texto underline-offset-2 hover:underline disabled:opacity-50 ${FOCO}`}
        >
          Gerar novo link
        </button>
      </div>
      <p className="text-sm text-texto-2">
        {primeiroNome ? `${primeiroNome} acompanha` : "O cliente acompanha"} as etapas, as datas e as fotos pelo celular, sem precisar ligar para perguntar. Suas
        anotações não aparecem.
      </p>
      {atual ? (
        <div className="flex gap-2">
          <input readOnly value={atual} aria-label="Link do cliente" className={`${CLASSE_ENTRADA} min-w-0 flex-1 text-sm`} onFocus={(e) => e.currentTarget.select()} />
          <Botao
            type="button"
            variante="secundario"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(atual);
                setAviso("Link copiado.");
              } catch {
                setAviso("Não foi possível copiar. Selecione o link e copie.");
              }
            }}
          >
            Copiar
          </Botao>
        </div>
      ) : (
        <p className="text-sm text-texto-2">Esta obra ainda não tem link. Use “Gerar novo link”.</p>
      )}
      {aviso && (
        <p role="status" className="text-xs text-texto-2">
          {aviso}
        </p>
      )}
    </section>
  );
}
