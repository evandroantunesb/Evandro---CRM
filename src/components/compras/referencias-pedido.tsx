import { formatarMoeda } from "@/lib/formatacao";
import type { OrcamentoDoPedido } from "./formulario-pedido";

/** Referências ao lado do total do pedido: o orçamento de onde ele nasceu e o previsto na venda para a categoria. */
export function ReferenciasPedido({
  total,
  orcamento,
  previsto,
  rotuloCategoria,
}: {
  total: number;
  orcamento: OrcamentoDoPedido | undefined;
  previsto: number | undefined;
  rotuloCategoria: string;
}) {
  return (
    <>
          {orcamento && (
            <div className="flex flex-col gap-1 rounded-xl bg-dourado/10 p-3 text-xs text-texto">
              <p className="font-medium">
                Orçamento de {orcamento.fornecedor} · {orcamento.itens}
              </p>
              <p className="tabular-nums">
                {formatarMoeda(orcamento.valorTotal)}
                {Math.abs(total - orcamento.valorTotal) >= 0.01 &&
                  ` · o pedido está ${formatarMoeda(Math.abs(total - orcamento.valorTotal))} ${total > orcamento.valorTotal ? "acima" : "abaixo"}`}
              </p>
            </div>
          )}
          {previsto != null && previsto > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-texto-2">
                <span>Previsto na venda · {rotuloCategoria}</span>
                <span className="tabular-nums">{formatarMoeda(previsto)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
                <div className="h-full rounded-full bg-dourado" style={{ width: `${Math.min(100, (total / previsto) * 100)}%` }} />
              </div>
              <p className="text-xs text-texto-2">
                {Math.round((total / previsto) * 100)}% do previsto na venda ·{" "}
                {total <= previsto ? `sobram ${formatarMoeda(previsto - total)}` : `passa ${formatarMoeda(total - previsto)}`}
              </p>
            </div>
          )}
    </>
  );
}
