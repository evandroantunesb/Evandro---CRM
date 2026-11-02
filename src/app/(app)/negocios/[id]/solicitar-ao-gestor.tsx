"use client";

import { useState, useTransition } from "react";
import { Botao, CLASSE_ENTRADA } from "@/components/ui";
import { solicitarDesconto } from "@/lib/acoes/descontos";

const percentual = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Desconto à vista acima do permitido: o vendedor escolhe entre pedir aprovação ao gestor (o mesmo pedido do cartão
 * "Desconto à vista") ou voltar ao próprio máximo. Pedir é opcional; enquanto não for aprovado, a emissão recusa o
 * desconto acima do permitido.
 */
export function SolicitarAoGestor({ negocioId, desconto, maximo, aoUsarMaximo }: { negocioId: string; desconto: number; maximo: number; aoUsarMaximo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  const pedir = () =>
    iniciar(async () => {
      const dados = new FormData();
      dados.set("negocioId", negocioId);
      dados.set("percentual", String(desconto));
      dados.set("motivo", motivo);
      setResultado(await solicitarDesconto(null, dados));
    });

  return (
    <div role="group" aria-label="Solicitar ao gestor" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950" data-testid="solicitar-ao-gestor">
      <p className="text-sm font-medium">Solicitar ao gestor</p>
      <p className="text-xs">
        {percentual(desconto)}% passa do seu máximo neste negócio ({percentual(maximo)}%). Peça aprovação ou volte ao seu máximo.
      </p>
      {resultado?.ok ? (
        <p role="status" className="text-xs">
          {resultado.mensagem} A proposta só sai com {percentual(desconto)}% depois da aprovação; até lá, emita com até {percentual(maximo)}%.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Motivo do desconto</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex.: cliente fecha hoje se ficar nesse valor"
              className={`${CLASSE_ENTRADA} text-sm`}
            />
          </label>
          {resultado && !resultado.ok && (
            <p role="alert" className="text-xs text-erro">
              {resultado.mensagem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao type="button" onClick={pedir} disabled={enviando || motivo.trim().length < 3}>
              {enviando ? "Enviando..." : "Solicitar ao gestor"}
            </Botao>
            <Botao type="button" variante="secundario" onClick={aoUsarMaximo}>
              Usar meu máximo ({percentual(maximo)}%)
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}

/** Personalizado com soma abaixo do permitido: o pedido é feito no cartão "Desconto à vista". */
export function AvisoDesconto() {
  return (
    <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Esse desconto passa do permitido neste negócio. Peça aprovação no cartão{" "}
      <a href="#desconto" className="font-medium underline">
        Desconto à vista
      </a>
      .
    </p>
  );
}
