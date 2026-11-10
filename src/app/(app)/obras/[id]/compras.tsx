import Link from "next/link";
import { CancelarPedido, RegistrarNf, RegistrarRecebimento } from "@/components/compras/acoes-pedido";
import { formatarMoeda } from "@/lib/formatacao";
import {
  ROTULO_SITUACAO_PEDIDO,
  entregaAtrasada,
  kitComprado,
  numeroPedido,
  pedidoEditavel,
  situacaoPedido,
  type ItemKitCompra,
  type PedidoVM,
  type SituacaoPedido,
} from "@/lib/compras/regras";
import { ROTULO_CATEGORIA_CUSTO } from "@/lib/obras/custos";

/**
 * Compras na ficha da obra (desenho aprovado "Compras na ficha da obra"): kit vendido × comprado × recebido e os pedidos
 * da obra, com nota fiscal, recebimento e cancelamento. Escreve quem atua em Compras na obra, o coordenador, o gestor ou
 * o admin; o banco confere de novo.
 */

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const TOM: Record<SituacaoPedido, string> = {
  aguardando_nf: "bg-zinc-100 text-zinc-700",
  faturado: "bg-zinc-100 text-zinc-700",
  recebido_parcial: "bg-atencao/20 text-atencao-texto",
  recebido: "bg-energia/10 text-energia",
  cancelado: "bg-zinc-100 text-zinc-500 line-through decoration-zinc-400/60",
};
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function PedidosCompraObra({
  obra,
  pedidos,
  kit,
  podeEscrever,
  podeNovoPedido,
  hoje,
  qtdOrcamentos,
}: {
  obra: { obraId: string; empresaId: string };
  pedidos: PedidoVM[];
  kit: ItemKitCompra[];
  podeEscrever: boolean;
  podeNovoPedido: boolean;
  hoje: string;
  /** Orçamentos em comparação (sem os descartados). */
  qtdOrcamentos: number;
}) {
  const ativos = pedidos.filter((p) => !p.cancelado);
  const linhasKit = kitComprado(kit, pedidos);
  const total = ativos.reduce((s, p) => s + p.valorTotal, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-2">
          {ativos.length === 0 ? "Nenhum pedido ainda." : `${ativos.length} ${ativos.length === 1 ? "pedido" : "pedidos"} · ${formatarMoeda(total)}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/obras/${obra.obraId}/compras`}
            className="inline-flex min-h-9 items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium text-texto hover:border-dourado"
          >
            Orçamentos e arquivos{qtdOrcamentos > 0 && ` (${qtdOrcamentos})`}
          </Link>
          {podeNovoPedido && (
            <Link
              href={`/compras/pedido?obra=${obra.obraId}`}
              className="inline-flex min-h-9 items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium text-texto hover:border-dourado"
            >
              + Pedido de compra
            </Link>
          )}
        </div>
      </div>

      {linhasKit.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-linha">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="px-3 pt-3 text-left text-xs font-medium text-texto-2">Kit vendido × comprado</caption>
            <thead>
              <tr className="border-b border-linha text-left text-xs text-texto-2">
                <th className="px-3 py-2 font-medium">Item do kit</th>
                <th className="px-3 py-2 text-right font-medium">Vendido</th>
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 text-right font-medium">Recebido</th>
              </tr>
            </thead>
            <tbody>
              {linhasKit.map((l) => (
                <tr key={l.indice} className="border-b border-linha last:border-b-0">
                  <td className="px-3 py-2 font-medium text-texto">{l.descricao}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qtd(l.vendido)}</td>
                  <td className="px-3 py-2 text-texto-2">{l.pedidos.length ? `${qtd(l.pedido)} · ${l.pedidos.join(", ")}` : "Sem pedido"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qtd(l.recebido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pedidos.length > 0 && (
        <ul className="flex flex-col divide-y divide-linha">
          {pedidos.map((p) => {
            const s = situacaoPedido(p);
            const atrasada = entregaAtrasada(p, hoje);
            const ativo = !p.cancelado;
            return (
              <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-texto">
                      {numeroPedido(p.numero)} · {p.fornecedor}
                    </p>
                    <p className="text-xs text-texto-2">
                      {ROTULO_CATEGORIA_CUSTO[p.categoria]} · {p.itens.length} {p.itens.length === 1 ? "item" : "itens"} · entrega {dataCurta(p.entregaPrevista)} ·
                      vence {dataCurta(p.vencimento)}
                      {p.nfNumero && <> · NF {p.nfNumero}</>}
                      {p.numeroFornecedor && <> · pedido no fornecedor {p.numeroFornecedor}</>}
                    </p>
                    {p.cancelado && p.motivoCancelamento && <p className="text-xs text-texto-2">Cancelado: {p.motivoCancelamento}</p>}
                  </div>
                  <span className="font-medium whitespace-nowrap text-texto tabular-nums">{formatarMoeda(p.valorTotal)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TOM[s]}`}>{ROTULO_SITUACAO_PEDIDO[s]}</span>
                  {atrasada && <span className="rounded-full bg-atencao/20 px-2.5 py-0.5 text-xs font-medium text-atencao-texto">Entrega atrasada</span>}
                </div>
                {podeEscrever && ativo && (
                  <div className="flex flex-wrap items-start gap-3">
                    {!p.temNf && <RegistrarNf obra={obra} pedidoId={p.id} valorPedido={p.valorTotal} vencimento={p.vencimento} />}
                    <RegistrarRecebimento obraId={obra.obraId} pedidoId={p.id} itens={p.itens} />
                    <a href={`/compras/pedido/${p.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-medium text-texto-2 underline hover:text-texto">
                      PDF do pedido
                    </a>
                    {pedidoEditavel(p) && (
                      <>
                        <Link
                          href={`/compras/pedido?obra=${obra.obraId}&pedido=${p.id}`}
                          className="text-xs font-medium text-texto-2 underline hover:text-texto"
                        >
                          Editar pedido
                        </Link>
                        <CancelarPedido obraId={obra.obraId} pedidoId={p.id} />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        O status de Compras anda sozinho com os pedidos: o primeiro pedido marca &quot;Pedido realizado&quot;; a nota fiscal de todos marca &quot;Faturado pelo
        fornecedor&quot; e lança cada conta a pagar no Financeiro; tudo recebido marca &quot;Material entregue&quot;.
      </p>
    </div>
  );
}
