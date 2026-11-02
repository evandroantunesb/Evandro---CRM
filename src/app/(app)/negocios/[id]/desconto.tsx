"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selo } from "@/components/ui";
import { decidirDesconto, solicitarDesconto } from "@/lib/acoes/descontos";
import { formatarDataHora } from "@/lib/formatacao";

export type PedidoDesconto = {
  id: string;
  percentual: number;
  motivo: string;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  solicitante: string;
  decisor: string | null;
  decididoEm: string | null;
  motivoDecisao: string | null;
  criadoEm: string;
};

const SITUACAO: Record<PedidoDesconto["status"], { rotulo: string; tom: "atencao" | "positivo" | "negativo" | "neutro" }> = {
  pendente: { rotulo: "Aguardando aprovação", tom: "atencao" },
  aprovado: { rotulo: "Aprovado", tom: "positivo" },
  recusado: { rotulo: "Recusado", tom: "negativo" },
  cancelado: { rotulo: "Substituído", tom: "neutro" },
};

const pct = (n: number) => `${String(n).replace(".", ",")}%`;

/**
 * Desconto à vista acima do limite: quem vê o negócio acompanha o último pedido; quem tem limite menor que o desejado
 * pede aprovação com motivo; admin ou gestor da equipe (até o próprio limite) aprova ou recusa. A emissão da proposta
 * com o desconto vem na tela de condições de pagamento.
 */
export function DescontoNegocio({
  negocioId,
  limite,
  souAdmin,
  pedidos,
  possoDecidir,
  podePedir,
}: {
  negocioId: string;
  limite: number;
  souAdmin: boolean;
  pedidos: PedidoDesconto[];
  possoDecidir: boolean;
  podePedir: boolean;
}) {
  const ultimo = pedidos.find((p) => p.status !== "cancelado") ?? null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        {souAdmin ? "Admin não tem limite de desconto à vista." : `Você dá até ${pct(limite)} de desconto à vista sem aprovação.`}
      </p>
      {ultimo && <UltimoPedido negocioId={negocioId} pedido={ultimo} possoDecidir={possoDecidir && ultimo.status === "pendente"} />}
      {podePedir && !souAdmin && <PedirDesconto negocioId={negocioId} limite={limite} temPendente={ultimo?.status === "pendente"} />}
    </div>
  );
}

function UltimoPedido({ negocioId, pedido, possoDecidir }: { negocioId: string; pedido: PedidoDesconto; possoDecidir: boolean }) {
  const situacao = SITUACAO[pedido.status];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-linha p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-texto">Pedido de {pct(pedido.percentual)}</span>
        <Selo tom={situacao.tom}>{situacao.rotulo}</Selo>
      </div>
      <p className="text-texto-2">
        {pedido.solicitante}, em {formatarDataHora(pedido.criadoEm)}: &ldquo;{pedido.motivo}&rdquo;
      </p>
      {pedido.decisor && pedido.decididoEm && pedido.status !== "pendente" && (
        <p className="text-texto-2">
          {situacao.rotulo} por {pedido.decisor} em {formatarDataHora(pedido.decididoEm)}
          {pedido.motivoDecisao ? `: “${pedido.motivoDecisao}”` : "."}
        </p>
      )}
      {possoDecidir && <Decidir negocioId={negocioId} pedidoId={pedido.id} />}
    </div>
  );
}

function Decidir({ negocioId, pedidoId }: { negocioId: string; pedidoId: string }) {
  const [resultado, acao, enviando] = useActionState(decidirDesconto, null);
  const [recusando, setRecusando] = useState(false);
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      {recusando && <Campo rotulo="Motivo da recusa" name="motivo" required minLength={3} maxLength={500} />}
      <div className="flex flex-wrap items-center gap-2">
        {recusando ? (
          <>
            <Botao type="submit" name="decisao" value="recusar" variante="secundario" disabled={enviando}>
              Confirmar recusa
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setRecusando(false)}>
              Voltar
            </Botao>
          </>
        ) : (
          <>
            <Botao type="submit" name="decisao" value="aprovar" disabled={enviando}>
              Aprovar
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setRecusando(true)}>
              Recusar
            </Botao>
          </>
        )}
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function PedirDesconto({ negocioId, limite, temPendente }: { negocioId: string; limite: number; temPendente: boolean }) {
  const [resultado, acao, enviando] = useActionState(solicitarDesconto, null);
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <span className="text-sm font-medium text-texto">Pedir desconto acima de {pct(limite)}</span>
      {temPendente && <span className="text-xs text-texto-2">Um pedido novo substitui o que está aguardando aprovação.</span>}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Campo rotulo="Desconto (%)" name="percentual" inputMode="decimal" required />
        <Campo rotulo="Motivo" name="motivo" required minLength={3} maxLength={500} placeholder="Ex.: cliente tem orçamento 8% menor" />
      </div>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Pedir aprovação"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
