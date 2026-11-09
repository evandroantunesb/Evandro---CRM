"use client";

import { CLASSE_ENTRADA } from "@/components/ui";
import type { MaterialPedidoVM } from "@/lib/compras/dados-precos";
import { precoSugerido } from "@/lib/compras/precos";

export type EscolhaDaTabela = { materialId: string; nome: string; unidade: string; preco: number; origem: string };

/**
 * "Preço da tabela" numa linha do pedido de compra: o preço do fornecedor do pedido, se ele tem preço para o material;
 * senão o melhor (menor) de todos. O valor continua editável.
 */
export function PrecoDaTabela({
  materiais,
  rotulo,
  materialId,
  fornecedor,
  aoEscolher,
}: {
  materiais: MaterialPedidoVM[];
  rotulo: string;
  materialId: string | null;
  /** Lê o fornecedor digitado no pedido na hora da escolha. */
  fornecedor: () => string;
  aoEscolher: (e: EscolhaDaTabela) => void;
}) {
  const escolher = (id: string) => {
    const m = materiais.find((x) => x.id === id);
    if (!m) return;
    const nomeFornecedor = fornecedor();
    const s = precoSugerido(m.precos, nomeFornecedor);
    if (!s) return;
    const quando = `${s.dataPreco.slice(8, 10)}/${s.dataPreco.slice(5, 7)}`;
    const nota = s.doFornecedor ? "" : nomeFornecedor.trim() ? " (melhor preço; este fornecedor não tem)" : " (melhor preço)";
    aoEscolher({ materialId: m.id, nome: m.nome, unidade: m.unidade, preco: s.preco, origem: `${s.fornecedor} · ${quando}${nota}` });
  };
  return (
    <select aria-label={rotulo} value={materialId ?? ""} onChange={(e) => escolher(e.target.value)} className={`${CLASSE_ENTRADA} mt-1.5 w-full min-w-40 text-xs`}>
      <option value="">Preço da tabela…</option>
      {materiais.map((m) => (
        <option key={m.id} value={m.id}>
          {m.nome}
        </option>
      ))}
    </select>
  );
}
