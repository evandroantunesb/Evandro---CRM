"use client";

import { FornecedorPedido } from "./fornecedor-pedido";
import { PrecoDaTabela, type EscolhaDaTabela } from "./preco-da-tabela";
import { ReferenciasPedido } from "./referencias-pedido";
import { FaturamentoEntrega } from "./faturamento-entrega";
import type { FaturamentoPedidoVM } from "@/lib/compras/faturamento";
import { ROTULO_FRETE, type ModalidadeFrete } from "@/lib/compras/regras";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { salvarPedidoCompra } from "@/lib/acoes/compras";
import { totalDoPedido, type ItemKitCompra } from "@/lib/compras/regras";
import type { MaterialPedidoVM } from "@/lib/compras/dados-precos";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO, type CategoriaCustoObra } from "@/lib/obras/custos";
import { formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Novo pedido de compra (desenho aprovado "Novo pedido de compra"): os itens vêm do kit vendido; a pessoa ajusta
 * quantidades e preços, tira o que não vem deste fornecedor e acrescenta o que faltar. Também edita um pedido ainda sem
 * nota e sem nada recebido. O banco valida tudo de novo.
 */

/** `daTabela`: de onde veio o valor, quando escolhido na tabela de preços (só na tela). */
type Linha = { chave: string; kitIndice: number | null; descricao: string; unidade: string; quantidade: string; valorUnitario: string; daTabela?: { materialId: string; origem: string } };

export type PedidoInicial = {
  pedidoId: string;
  fornecedor: string;
  categoria: CategoriaCustoObra;
  entregaPrevista: string;
  vencimento: string;
  numeroFornecedor: string;
  frete: number;
  freteModalidade: ModalidadeFrete;
  faturarPara: "cliente" | "empresa";
  entrega: { endereco: string; recebe: string; telefone: string | null } | null;
  observacao: string;
  itens: { kitIndice: number | null; descricao: string; unidade: string; quantidade: number; valorUnitario: number }[];
};

/** "Gerar pedido deste": o orçamento de onde o pedido nasce (só no pedido novo). */
export type OrcamentoDoPedido = {
  id: string;
  fornecedor: string;
  entregaPrevista: string;
  valorTotal: number;
  itens: string;
  freteModalidade: ModalidadeFrete;
  frete: number;
};

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
  faturamento,
  tabelaPrecos = [],
}: {
  obraId: string;
  kit: ItemKitCompra[];
  orcamento: Partial<Record<string, number>>;
  fornecedores: string[];
  hoje: string;
  inicial?: PedidoInicial;
  doOrcamento?: OrcamentoDoPedido;
  faturamento: FaturamentoPedidoVM;
  /** Materiais com preço na tabela de preços (vazio para quem não a vê). */
  tabelaPrecos?: MaterialPedidoVM[];
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
  const [frete, setFrete] = useState(numeroBr(inicial?.frete ?? doOrcamento?.frete ?? 0));
  const [freteModalidade, setFreteModalidade] = useState<ModalidadeFrete>(inicial?.freteModalidade ?? doOrcamento?.freteModalidade ?? "cif");
  const [faturarPara, setFaturarPara] = useState<"cliente" | "empresa">(inicial?.faturarPara ?? "cliente");
  const [mesmaEntrega, setMesmaEntrega] = useState(!inicial?.entrega);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const mudar = (chave: string, campo: "descricao" | "unidade" | "quantidade" | "valorUnitario", valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor, ...(campo === "valorUnitario" ? { daTabela: undefined } : {}) } : l)));
  const formRef = useRef<HTMLFormElement>(null);
  const fornecedorDigitado = () => {
    const campo = formRef.current?.elements.namedItem("fornecedor");
    return campo instanceof HTMLInputElement ? campo.value : "";
  };
  const usarDaTabela = (chave: string, e: EscolhaDaTabela) =>
    setLinhas((ls) =>
      ls.map((l) =>
        l.chave === chave
          ? { ...l, descricao: l.kitIndice == null && !l.descricao.trim() ? e.nome : l.descricao, unidade: e.unidade, valorUnitario: numeroBr(e.preco), daTabela: { materialId: e.materialId, origem: e.origem } }
          : l,
      ),
    );
  const numericas = linhas.map((l) => ({ quantidade: ler(l.quantidade) ?? 0, valorUnitario: ler(l.valorUnitario) ?? 0 }));
  const total = totalDoPedido(numericas, freteModalidade === "fob" ? (ler(frete) ?? 0) : 0);
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
    const valorFrete = freteModalidade === "fob" ? ler(frete) : 0;
    if (valorFrete == null || valorFrete < 0) {
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
      freteModalidade,
      faturarPara,
      observacao: String(f.get("observacao") ?? ""),
      entrega:
        faturarPara === "cliente" && mesmaEntrega
          ? null
          : {
              endereco: String(f.get("entregaEndereco") ?? ""),
              recebe: String(f.get("entregaRecebe") ?? ""),
              telefone: String(f.get("entregaTelefone") ?? ""),
            },
      itens,
    });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.push(`/obras/${obraId}#pedidos-compra`);
  };

  return (
    <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <FornecedorPedido
          fornecedores={fornecedores}
          categoria={categoria}
          aoMudarCategoria={setCategoria}
          hoje={hoje}
          inicial={inicial}
          doOrcamento={inicial ? undefined : doOrcamento}
        />

        <FaturamentoEntrega
          faturamento={faturamento}
          faturarPara={faturarPara}
          aoMudarFaturarPara={setFaturarPara}
          mesmaEntrega={mesmaEntrega}
          aoMudarMesmaEntrega={setMesmaEntrega}
          entregaInicial={inicial?.entrega ?? null}
        />

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
                      {tabelaPrecos.length > 0 && (
                        <PrecoDaTabela
                          materiais={tabelaPrecos}
                          rotulo={`Preço da tabela para ${l.descricao || `item ${i + 1}`}`}
                          materialId={l.daTabela?.materialId ?? null}
                          fornecedor={fornecedorDigitado}
                          aoEscolher={(e) => usarDaTabela(l.chave, e)}
                        />
                      )}
                      {l.daTabela && <span className="mt-1 block text-xs text-texto-2">Tabela: {l.daTabela.origem}</span>}
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
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-texto-2">Frete</span>
                <select value={freteModalidade} onChange={(e) => setFreteModalidade(e.target.value as ModalidadeFrete)} className={CLASSE_ENTRADA}>
                  <option value="cif">{ROTULO_FRETE.cif}</option>
                  <option value="fob">{ROTULO_FRETE.fob}</option>
                </select>
              </label>
              {freteModalidade === "fob" && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-texto-2">Valor do frete (R$)</span>
                  <input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} className={`${CLASSE_ENTRADA} w-28 text-right tabular-nums`} />
                </label>
              )}
            </div>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:w-80">
        <section className="painel flex flex-col gap-4 p-4 md:p-6">
          <div>
            <p className="text-xs font-medium text-texto-2">Total do pedido</p>
            <p className="font-titulo text-3xl font-light tracking-tight text-texto tabular-nums">{formatarMoeda(total)}</p>
          </div>
          <ReferenciasPedido total={total} orcamento={inicial ? undefined : doOrcamento} previsto={previsto} rotuloCategoria={ROTULO_CATEGORIA_CUSTO[categoria]} />
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
