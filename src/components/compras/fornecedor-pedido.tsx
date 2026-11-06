"use client";

import { useId } from "react";
import { CLASSE_ENTRADA } from "@/components/ui";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO, type CategoriaCustoObra } from "@/lib/obras/custos";
import type { OrcamentoDoPedido, PedidoInicial } from "./formulario-pedido";

/** Fornecedor, categoria, datas, nº no fornecedor e observações do pedido (vão no envio do formulário). */
export function FornecedorPedido({
  fornecedores,
  categoria,
  aoMudarCategoria,
  hoje,
  inicial,
  doOrcamento,
}: {
  fornecedores: string[];
  categoria: CategoriaCustoObra;
  aoMudarCategoria: (c: CategoriaCustoObra) => void;
  hoje: string;
  inicial: PedidoInicial | undefined;
  doOrcamento: OrcamentoDoPedido | undefined;
}) {
  const id = useId();
  return (
        <section className="painel flex flex-col gap-3 p-4 md:p-6">
          <h2 className="font-titulo text-lg text-texto">Fornecedor e entrega</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Fornecedor</span>
              <input
                name="fornecedor"
                required
                minLength={2}
                maxLength={120}
                list={`${id}-fornecedores`}
                autoComplete="off"
                defaultValue={inicial?.fornecedor ?? doOrcamento?.fornecedor}
                placeholder="Ex.: Distribuidora Solar Sul"
                className={CLASSE_ENTRADA}
              />
              <datalist id={`${id}-fornecedores`}>
                {fornecedores.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Categoria do custo</span>
              <select value={categoria} onChange={(e) => aoMudarCategoria(e.target.value as CategoriaCustoObra)} className={CLASSE_ENTRADA}>
                {CATEGORIAS_CUSTO_OBRA.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CATEGORIA_CUSTO[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Entrega prevista</span>
              <input name="entregaPrevista" type="date" required defaultValue={inicial?.entregaPrevista ?? doOrcamento?.entregaPrevista ?? hoje} className={CLASSE_ENTRADA} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Vencimento do pagamento</span>
              <input name="vencimento" type="date" required defaultValue={inicial?.vencimento ?? hoje} className={CLASSE_ENTRADA} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-texto-2">Nº do pedido no fornecedor (opcional)</span>
              <input name="numeroFornecedor" maxLength={60} defaultValue={inicial?.numeroFornecedor} placeholder="Ex.: 48213" className={CLASSE_ENTRADA} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-texto-2">Observações para o fornecedor (opcional, vão no PDF)</span>
              <textarea name="observacao" maxLength={500} rows={2} defaultValue={inicial?.observacao} placeholder="Ex.: entregar pela manhã; ligar antes para quem recebe" className={CLASSE_ENTRADA} />
            </label>
          </div>
        </section>
  );
}
