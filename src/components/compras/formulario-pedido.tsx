"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { salvarPedidoCompra } from "@/lib/acoes/compras";
import { totalDoPedido, type ItemKitCompra } from "@/lib/compras/regras";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO, type CategoriaCustoObra } from "@/lib/obras/custos";
import { formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Novo pedido de compra (desenho aprovado "Novo pedido de compra"): os itens vêm do kit vendido; a pessoa ajusta
 * quantidades e preços, tira o que não vem deste fornecedor e acrescenta o que faltar. Também edita um pedido ainda sem
 * nota e sem nada recebido. O banco valida tudo de novo.
 */

type Linha = { chave: string; kitIndice: number | null; descricao: string; unidade: string; quantidade: string; valorUnitario: string };

export type PedidoInicial = {
  pedidoId: string;
  fornecedor: string;
  categoria: CategoriaCustoObra;
  entregaPrevista: string;
  vencimento: string;
  numeroFornecedor: string;
  frete: number;
  itens: { kitIndice: number | null; descricao: string; unidade: string; quantidade: number; valorUnitario: number }[];
};

/** "Gerar pedido deste": o orçamento de onde o pedido nasce (só no pedido novo). */
export type OrcamentoDoPedido = { id: string; fornecedor: string; entregaPrevista: string; valorTotal: number; itens: string };

const numeroBr = (n: number, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas === 2 ? 2 : 0, maximumFractionDigits: casas });
const ler = (v: string) => lerNumeroBr(v);

export function FormularioPedido({
  obraId,
  kit,
  orcamento,
  fornecedores,
  hoje,
  inicial,
  doOrcamento,
  jaPedido,
}: {
  obraId: string;
  kit: ItemKitCompra[];
  orcamento: Partial<Record<string, number>>;
  fornecedores: string[];
  hoje: string;
  inicial?: PedidoInicial;
  doOrcamento?: OrcamentoDoPedido;
  /** Quanto de cada item do kit já está em outros pedidos ativos (o restante é a sugestão). */
  jaPedido: Record<number, number>;
}) {
  const id = useId();
  const router = useRouter();
  // Linhas novas (nos cliques) ganham uma chave aleatória; as iniciais, a posição.
  const nova = (l: Omit<Linha, "chave">): Linha => ({ ...l, chave: crypto.randomUUID() });
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (inicial
      ? inicial.itens.map((i) => ({ ...i, quantidade: numeroBr(i.quantidade, 3), valorUnitario: numeroBr(i.valorUnitario) }))
      : kit
          .map((k) => ({ k, falta: Math.max(0, k.quantidade - (jaPedido[k.indice] ?? 0)) }))
          .filter(({ falta }) => falta > 0)
          .map(({ k, falta }) => ({ kitIndice: k.indice, descricao: k.descricao, unidade: "un", quantidade: numeroBr(falta, 3), valorUnitario: "" }))
    ).map((l, i) => ({ ...l, chave: `inicial-${i}` })),
  );
  const [categoria, setCategoria] = useState<CategoriaCustoObra>(inicial?.categoria ?? "equipamentos");
  const [frete, setFrete] = useState(inicial ? numeroBr(inicial.frete) : "0,00");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const mudar = (chave: string, campo: keyof Linha, valor: string) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  const numericas = linhas.map((l) => ({ quantidade: ler(l.quantidade) ?? 0, valorUnitario: ler(l.valorUnitario) ?? 0 }));
  const total = totalDoPedido(numericas, ler(frete) ?? 0);
  const previsto = orcamento[categoria];
  const kitNoPedido = new Set(linhas.map((l) => l.kitIndice).filter((i) => i != null));
  const doKitFora = kit.filter((k) => !kitNoPedido.has(k.indice));

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const itens = [];
    for (const l of linhas) {
      const quantidade = ler(l.quantidade);
      const valorUnitario = ler(l.valorUnitario);
      if (quantidade == null || valorUnitario == null) {
        setResultado({ ok: false, mensagem: `Confira a quantidade e o valor de "${l.descricao || "item"}" (ex.: 1.234,56).` });
        return;
      }
      itens.push({ kitIndice: l.kitIndice, descricao: l.descricao, unidade: l.unidade || "un", quantidade, valorUnitario });
    }
    const valorFrete = ler(frete);
    if (valorFrete == null) {
      setResultado({ ok: false, mensagem: "Confira o frete (ex.: 120,00)." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const r = await salvarPedidoCompra({
      obraId,
      pedidoId: inicial?.pedidoId ?? null,
      orcamentoId: inicial ? null : (doOrcamento?.id ?? null),
      fornecedor: String(f.get("fornecedor") ?? ""),
      categoria,
      entregaPrevista: String(f.get("entregaPrevista") ?? ""),
      vencimento: String(f.get("vencimento") ?? ""),
      numeroFornecedor: String(f.get("numeroFornecedor") ?? ""),
      frete: valorFrete,
      itens,
    });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.push(`/obras/${obraId}#pedidos-compra`);
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
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
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCustoObra)} className={CLASSE_ENTRADA}>
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
          </div>
        </section>

        <section className="painel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2 md:px-6">
            <h2 className="font-titulo text-lg text-texto">Itens</h2>
            {kit.length > 0 && (
              <span className="rounded-full bg-dourado/15 px-2.5 py-0.5 text-xs font-medium text-dourado-texto">
                {kit.length - doKitFora.length} de {kit.length} itens do kit
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-linha text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium md:px-6">Item</th>
                  <th className="px-2 py-2 font-medium">Unid.</th>
                  <th className="px-2 py-2 text-right font-medium">Qtd.</th>
                  <th className="px-2 py-2 text-right font-medium">Valor unit. (R$)</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 md:px-6">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.chave} className="border-b border-linha last:border-b-0">
                    <td className="px-4 py-2 md:px-6">
                      {l.kitIndice != null ? (
                        <>
                          <span className="font-medium text-texto">{l.descricao}</span>
                          <span className="block text-xs text-texto-2">do kit</span>
                        </>
                      ) : (
                        <input
                          aria-label={`Descrição do item ${i + 1}`}
                          value={l.descricao}
                          onChange={(e) => mudar(l.chave, "descricao", e.target.value)}
                          required
                          maxLength={200}
                          placeholder="Ex.: Estrutura para telhado cerâmico"
                          className={`${CLASSE_ENTRADA} w-full min-w-40`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label={`Unidade de ${l.descricao || `item ${i + 1}`}`}
                        value={l.unidade}
                        onChange={(e) => mudar(l.chave, "unidade", e.target.value)}
                        maxLength={20}
                        className={`${CLASSE_ENTRADA} w-16`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        aria-label={`Quantidade de ${l.descricao || `item ${i + 1}`}`}
                        inputMode="decimal"
                        value={l.quantidade}
                        onChange={(e) => mudar(l.chave, "quantidade", e.target.value)}
                        required
                        className={`${CLASSE_ENTRADA} w-20 text-right tabular-nums`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        aria-label={`Valor unitário de ${l.descricao || `item ${i + 1}`}`}
                        inputMode="decimal"
                        value={l.valorUnitario}
                        onChange={(e) => mudar(l.chave, "valorUnitario", e.target.value)}
                        required
                        placeholder="0,00"
                        className={`${CLASSE_ENTRADA} w-28 text-right tabular-nums`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{formatarMoeda(totalDoPedido([numericas[i]], 0))}</td>
                    <td className="px-4 py-2 md:px-6">
                      <Botao type="button" variante="secundario" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                        Tirar
                      </Botao>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-texto-2 md:px-6">
                      Nenhum item. Acrescente um item do kit ou fora dele.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-linha p-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex flex-wrap gap-2">
              <Botao
                type="button"
                variante="secundario"
                onClick={() => setLinhas((ls) => [...ls, nova({ kitIndice: null, descricao: "", unidade: "un", quantidade: "1", valorUnitario: "" })])}
              >
                + Item fora do kit
              </Botao>
              {doKitFora.length > 0 && (
                <select
                  aria-label="Voltar um item do kit"
                  value=""
                  onChange={(e) => {
                    const k = kit.find((x) => x.indice === Number(e.target.value));
                    if (k) setLinhas((ls) => [...ls, nova({ kitIndice: k.indice, descricao: k.descricao, unidade: "un", quantidade: numeroBr(k.quantidade, 3), valorUnitario: "" })]);
                  }}
                  className={CLASSE_ENTRADA}
                >
                  <option value="">+ Item do kit</option>
                  {doKitFora.map((k) => (
                    <option key={k.indice} value={k.indice}>
                      {k.descricao}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium text-texto-2">Frete (R$)</span>
              <input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} className={`${CLASSE_ENTRADA} w-28 text-right tabular-nums`} />
            </label>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:w-80">
        <section className="painel flex flex-col gap-4 p-4 md:p-6">
          <div>
            <p className="text-xs font-medium text-texto-2">Total do pedido</p>
            <p className="font-titulo text-3xl font-light tracking-tight text-texto tabular-nums">{formatarMoeda(total)}</p>
          </div>
          {doOrcamento && !inicial && (
            <div className="flex flex-col gap-1 rounded-xl bg-dourado/10 p-3 text-xs text-texto">
              <p className="font-medium">
                Orçamento de {doOrcamento.fornecedor} · {doOrcamento.itens}
              </p>
              <p className="tabular-nums">
                {formatarMoeda(doOrcamento.valorTotal)}
                {Math.abs(total - doOrcamento.valorTotal) >= 0.01 &&
                  ` · o pedido está ${formatarMoeda(Math.abs(total - doOrcamento.valorTotal))} ${total > doOrcamento.valorTotal ? "acima" : "abaixo"}`}
              </p>
            </div>
          )}
          {previsto != null && previsto > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-texto-2">
                <span>Previsto na venda · {ROTULO_CATEGORIA_CUSTO[categoria]}</span>
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
          <div className="flex flex-col gap-2">
            <Botao type="submit" disabled={enviando || linhas.length === 0}>
              {enviando ? "Salvando..." : inicial ? "Salvar pedido" : "Fazer pedido"}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => router.back()}>
              Cancelar
            </Botao>
          </div>
          <Mensagem resultado={resultado} />
        </section>
        <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
          {inicial
            ? "O pedido só muda enquanto não tem nota fiscal nem material recebido."
            : "Ao salvar, Compras da obra passa a \"Pedido realizado\". A nota fiscal do fornecedor vem depois, no próprio pedido: com ela, a conta a pagar nasce no Financeiro, no valor da nota e no vencimento acima."}
        </p>
      </aside>
    </form>
  );
}
