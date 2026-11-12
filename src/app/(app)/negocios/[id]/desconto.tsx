"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selo } from "@/components/ui";
import { cancelarDesconto, decidirDesconto, solicitarDesconto } from "@/lib/acoes/descontos";
import {
  descontoPermitido,
  descontoTotal,
  formatarPercentual,
  passaDoPermitido,
  precoMinimoCentavos,
  type RegrasCondicoes,
} from "@/lib/condicoes-pagamento-proposta";
import type { ResumoDescontoGestor } from "@/lib/descontos-resumo";
import { formatarDataHora, formatarMoeda } from "@/lib/formatacao";

export type PedidoDesconto = {
  id: string;
  percentual: number;
  motivo: string;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  solicitante: string;
  /** O pedido é de quem está vendo (pode cancelar enquanto pendente). */
  meu: boolean;
  /** Preço sugerido no momento do pedido (nulo = pedido sem sugerido, só em %). */
  precoSugerido: number | null;
  decisor: string | null;
  decididoEm: string | null;
  motivoDecisao: string | null;
  criadoEm: string;
};

const SITUACAO: Record<PedidoDesconto["status"], { rotulo: string; tom: "atencao" | "positivo" | "negativo" | "neutro" }> = {
  pendente: { rotulo: "Aguardando aprovação", tom: "atencao" },
  aprovado: { rotulo: "Aprovado", tom: "positivo" },
  recusado: { rotulo: "Recusado", tom: "negativo" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

const pct = (n: number) => `${formatarPercentual(n)}%`;
/** O pedido em reais (sobre o sugerido do momento) e em %. */
const descricaoPedido = (p: Pick<PedidoDesconto, "percentual" | "precoSugerido">) =>
  p.precoSugerido != null ? `${formatarMoeda(Math.round(p.precoSugerido * (100 - p.percentual)) / 100)} (−${pct(p.percentual)})` : pct(p.percentual);

/**
 * Desconto do negócio (desconto à vista e, com preço sugerido pela tabela, o valor abaixo dele: Compras P4c). O
 * desconto é o preço final contra o maior entre o sugerido e o valor do negócio. Acima do permitido (o limite de quem
 * vê ou o maior já aprovado), a proposta e o contrato não saem: o vendedor pede aprovação com motivo; admin ou gestor
 * da equipe (até o próprio limite) aprova ou recusa. Recusar ou cancelar não muda o valor do negócio.
 */
export function DescontoNegocio({
  negocioId,
  limite,
  souAdmin,
  pedidos,
  possoDecidir,
  podePedir,
  valor,
  regras,
  resumo,
}: {
  negocioId: string;
  limite: number;
  souAdmin: boolean;
  pedidos: PedidoDesconto[];
  possoDecidir: boolean;
  podePedir: boolean;
  valor: number | null;
  regras: Pick<RegrasCondicoes, "limiteDesconto" | "descontoAprovado" | "precoSugerido"> | null;
  resumo: ResumoDescontoGestor | null;
}) {
  // Pedido substituído por um novo não aparece; o cancelado por quem pediu, sim (até o próximo).
  const ultimo = pedidos.find((p) => p.status !== "cancelado" || p.motivoDecisao !== "Substituído por um pedido novo.") ?? null;
  const pendente = ultimo?.status === "pendente";
  const sugerido = regras?.precoSugerido ?? null;
  const valorNegocio = valor != null && valor > 0 ? valor : null;
  const passa = !!(regras && sugerido && valorNegocio && passaDoPermitido(valorNegocio, valorNegocio, regras));
  const descontoAtual = regras && sugerido && valorNegocio && valorNegocio < sugerido ? descontoTotal(valorNegocio, valorNegocio, regras) : 0;
  const minimo = regras && valorNegocio ? formatarMoeda(precoMinimoCentavos(valorNegocio, regras) / 100) : "";
  const permitido = regras ? pct(descontoPermitido(regras)) : "";
  return (
    <div className="flex flex-col gap-4">
      {sugerido != null && valorNegocio != null && (
        <p className="text-sm text-texto-2">
          Preço sugerido: <b className="tabular-nums text-texto">{formatarMoeda(sugerido)}</b> · valor do negócio:{" "}
          <b className="tabular-nums text-texto">{formatarMoeda(valorNegocio)}</b>
          {descontoAtual > 0 && (
            <>
              {" "}
              · desconto de <b className="text-texto">{pct(descontoAtual)}</b>
            </>
          )}
        </p>
      )}
      {passa && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pendente
            ? `Aguardando aprovação: a proposta e o contrato só saem depois dela, ou com o valor de volta a até ${permitido} de desconto (${minimo}).`
            : `Acima do desconto liberado (${permitido}). O gestor precisa aprovar antes de gerar a proposta e o contrato. Até ${permitido} (${minimo}) passa direto.`}
        </p>
      )}
      <p className="text-sm text-texto-2">
        {souAdmin ? "Admin não tem limite de desconto." : `Você dá até ${pct(limite)} de desconto sem aprovação.`}
        {sugerido != null && " O desconto conta do preço sugerido, somado ao desconto à vista."}
      </p>
      {ultimo && <UltimoPedido negocioId={negocioId} pedido={ultimo} possoDecidir={possoDecidir && pendente} resumo={pendente ? resumo : null} />}
      {podePedir && !souAdmin && (
        <PedirDesconto
          key={`${descontoAtual}-${passa}`}
          negocioId={negocioId}
          limite={limite}
          temPendente={pendente}
          sugestao={passa && !pendente ? descontoAtual : null}
        />
      )}
    </div>
  );
}

function UltimoPedido({
  negocioId,
  pedido,
  possoDecidir,
  resumo,
}: {
  negocioId: string;
  pedido: PedidoDesconto;
  possoDecidir: boolean;
  resumo: ResumoDescontoGestor | null;
}) {
  const situacao = SITUACAO[pedido.status];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-linha p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-texto">Pedido de {descricaoPedido(pedido)}</span>
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
      {resumo && <ResumoGestor resumo={resumo} />}
      {possoDecidir && <Decidir negocioId={negocioId} pedidoId={pedido.id} />}
      {pedido.meu && pedido.status === "pendente" && <Cancelar negocioId={negocioId} pedidoId={pedido.id} />}
    </div>
  );
}

/** Só para quem decide e vê a tabela de preços: o vendedor nunca recebe custo, comissão nem sobra. */
function ResumoGestor({ resumo: r }: { resumo: ResumoDescontoGestor }) {
  const linhas: [string, number][] = [
    ["Preço sugerido pela tabela", r.sugerido],
    ["Valor pedido", r.valorPedido],
    [r.custoParcial ? "Custo dos itens com preço na tabela" : "Custo dos itens (tabela de preços)", r.custoItens],
    ["Custos internos (instalação, material CA, engenharia)", r.custosInternos],
    [`Comissão (${pct(Math.round(r.comissaoPercentual * 10000) / 100)} do valor pedido)`, r.comissao],
  ];
  return (
    <div className="flex flex-col gap-1 rounded-md bg-fundo px-3 py-2" data-testid="resumo-desconto-gestor">
      {linhas.map(([rotulo, v]) => (
        <div key={rotulo} className="flex justify-between gap-3 text-texto-2">
          <span>{rotulo}</span>
          <span className="tabular-nums text-texto">{formatarMoeda(v)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-linha pt-1 font-medium text-texto">
        <span>Sobra com o desconto</span>
        <span className="tabular-nums">
          {formatarMoeda(r.sobra)} ({formatarPercentual(r.sobraPercentual)}%)
        </span>
      </div>
      {r.custoParcial && <p className="text-xs text-texto-2">Há item do kit sem preço na tabela: o custo dele não está na conta.</p>}
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

function Cancelar({ negocioId, pedidoId }: { negocioId: string; pedidoId: string }) {
  const [resultado, acao, enviando] = useActionState(cancelarDesconto, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <Botao type="submit" variante="secundario" disabled={enviando}>
        {enviando ? "Cancelando..." : "Cancelar pedido de desconto"}
      </Botao>
      <span className="text-xs text-texto-2">O valor do negócio não muda.</span>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function PedirDesconto({ negocioId, limite, temPendente, sugestao }: { negocioId: string; limite: number; temPendente: boolean; sugestao: number | null }) {
  const [resultado, acao, enviando] = useActionState(solicitarDesconto, null);
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <span className="text-sm font-medium text-texto">Pedir desconto acima de {pct(limite)}</span>
      {temPendente && <span className="text-xs text-texto-2">Um pedido novo substitui o que está aguardando aprovação.</span>}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Campo rotulo="Desconto (%)" name="percentual" inputMode="decimal" required defaultValue={sugestao != null ? formatarPercentual(sugestao) : undefined} />
        <Campo rotulo="Motivo (vai para o gestor)" name="motivo" required minLength={3} maxLength={500} placeholder="Ex.: cliente fecha esta semana com este valor" />
      </div>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Pedir aprovação do desconto"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
