"use client";

import { useState, useTransition } from "react";
import { Botao, CLASSE_ENTRADA } from "@/components/ui";
import { solicitarDesconto } from "@/lib/acoes/descontos";
import { formatarMoeda } from "@/lib/formatacao";

const percentual = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Desconto à vista acima do permitido: o vendedor escolhe entre pedir aprovação ao gestor (o mesmo pedido do cartão
 * "Desconto") ou voltar ao próprio máximo. Pedir é opcional; enquanto não for aprovado, a emissão recusa o desconto
 * acima do permitido. `desconto` e `maximo` são o desconto total (sobre o preço sugerido, se houver: Compras P4c);
 * `maximoAVista` é o % à vista que ainda cabe.
 */
export function SolicitarAoGestor({
  negocioId,
  desconto,
  maximo,
  maximoAVista,
  aoUsarMaximo,
}: {
  negocioId: string;
  desconto: number;
  maximo: number;
  maximoAVista: number;
  aoUsarMaximo: () => void;
}) {
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
          {resultado.mensagem} A proposta só sai com {percentual(desconto)}% depois da aprovação; até lá, emita com até {percentual(maximoAVista)}% à vista.
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
              Usar meu máximo ({percentual(maximoAVista)}% à vista)
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}

/** Preço do sistema nas condições de pagamento, o sugerido pela tabela quando é maior (Compras P4c) e a pendência do valor. */
export function PrecoDoSistema({ preco, precoSugerido, pendencia }: { preco: number | null; precoSugerido: number | null; pendencia: string | null }) {
  return (
    <>
      <p className="-mt-1 text-xs text-texto-2">
        Preço do sistema: <strong className="text-texto">{preco != null ? formatarMoeda(preco) : "informe o valor do negócio"}</strong>
        {preco != null && precoSugerido != null && precoSugerido > preco && <> · sugerido: {formatarMoeda(precoSugerido)}</>}
      </p>
      {pendencia && <AvisoDesconto texto={pendencia} />}
    </>
  );
}

/** Desconto acima do permitido (Personalizado, ou o próprio valor abaixo do sugerido): o pedido é feito no cartão "Desconto". */
export function AvisoDesconto({ texto }: { texto?: string }) {
  return (
    <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {texto ? (
        <>
          {texto}{" "}
          <a href="#desconto" className="font-medium underline">
            Ir para o cartão Desconto
          </a>
          .
        </>
      ) : (
        <>
          Esse desconto passa do permitido neste negócio. Peça aprovação no cartão{" "}
          <a href="#desconto" className="font-medium underline">
            Desconto
          </a>
          .
        </>
      )}
    </p>
  );
}
