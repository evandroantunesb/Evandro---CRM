import { CalendarClock, ClipboardList, FileText, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Indicadores, type Indicador } from "@/app/(app)/negocios/indicadores";
import { IniciarCompra } from "@/components/compras/acoes-pedido";
import { AbasCompras } from "@/components/compras/abas-compras";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { FOCO } from "@/components/ui";
import { acessaCompras, carregarTelaCompras } from "@/lib/compras/dados";
import { acessoPrecos } from "@/lib/compras/dados-precos";
import {
  ABAS_COMPRAS,
  ROTULO_SITUACAO_PEDIDO,
  abaCompras,
  diasEntre,
  entregaAtrasada,
  filtrarPedidos,
  kpisCompras,
  numeroPedido,
  pedidoEmAberto,
  pedidosDaAba,
  situacaoPedido,
  type AbaCompras,
} from "@/lib/compras/regras";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Compras (desenho aprovado "Compras (tela /compras)"): obras a comprar, pedidos em aberto, recebidos e todos, com os
 * indicadores do topo. Veem admin, gestor e quem atua em Compras (ou no setor que atende no lugar dele). As ações
 * seguem a ficha da obra; o banco confere de novo.
 */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default async function Compras({ searchParams }: PageProps<"/compras">) {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  if (!(await acessaCompras(supabase, atual.empresaId, atual.papel))) redirect("/inicio");
  const params = await searchParams;
  const aba = abaCompras(params.aba);
  const busca = typeof params.q === "string" ? params.q.trim() : "";
  const hoje = hojeEmSaoPaulo();

  const verPrecos = (await acessoPrecos(supabase, atual.empresaId)).ver;
  const dados = await carregarTelaCompras(supabase, { empresaId: atual.empresaId, papel: atual.papel, membroId: atual.membroId });
  const k = kpisCompras({ pedidos: dados.pedidos, aComprar: dados.aComprar.filter((o) => o.status === "a_comprar").length, hoje });
  const indicadores: Indicador[] = [
    { Icone: ClipboardList, legenda: "Obras a comprar", valor: String(k.aComprar), rodape: "aguardando Compras" },
    { Icone: FileText, legenda: "Aguardando nota fiscal", valor: formatarMoeda(k.aguardandoNf.valor), rodape: plural(k.aguardandoNf.quantidade, "pedido", "pedidos") },
    { Icone: CalendarClock, legenda: "Entregas em 7 dias", valor: String(k.entregas7.quantidade), rodape: plural(k.entregas7.atrasadas, "atrasada", "atrasadas") },
    { Icone: ShoppingCart, legenda: "Comprado no mês", valor: formatarMoeda(k.compradoMes.valor), rodape: plural(k.compradoMes.quantidade, "pedido", "pedidos") },
  ];
  const contagem: Record<AbaCompras, number | null> = {
    "a-comprar": dados.aComprar.length,
    "em-aberto": dados.pedidos.filter(pedidoEmAberto).length,
    recebidos: null,
    todos: null,
  };
  const href = (destino: AbaCompras) => {
    const q = new URLSearchParams({ ...(destino !== "em-aberto" ? { aba: destino } : {}), ...(busca ? { q: busca } : {}) }).toString();
    return `/compras${q ? `?${q}` : ""}`;
  };
  const pedidos = filtrarPedidos(pedidosDaAba(dados.pedidos, aba), busca);
  const aComprar = busca
    ? dados.aComprar.filter((o) => `${o.clienteNome} #${o.numero} ${o.cidade ?? ""}`.toLowerCase().includes(busca.toLowerCase()))
    : dados.aComprar;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Operação · Compras"
        titulo="Compras"
        descricao="Pedidos de compra das obras, do kit vendido ao material entregue. A nota fiscal do fornecedor vira conta a pagar no Financeiro."
        acoes={
          dados.obrasParaPedido.length > 0 ? (
            <Link href="/compras/pedido" className={CLASSE_ACAO_CABECALHO}>
              <Plus size={16} aria-hidden />
              Novo pedido
            </Link>
          ) : undefined
        }
      />

      {verPrecos && <AbasCompras atual="pedidos" />}

      <Indicadores itens={indicadores} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <nav aria-label="Seção" className="flex gap-1 overflow-x-auto border-b border-linha">
          {ABAS_COMPRAS.map((a) => {
            const n = contagem[a.valor];
            return (
              <Link
                key={a.valor}
                href={href(a.valor)}
                aria-current={aba === a.valor ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${FOCO} ${
                  aba === a.valor ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
                }`}
              >
                {a.rotulo}
                {n != null && ` (${n})`}
              </Link>
            );
          })}
        </nav>
        <form role="search" action="/compras" className="flex gap-2">
          {aba !== "em-aberto" && <input type="hidden" name="aba" value={aba} />}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            aria-label="Buscar"
            placeholder="Buscar por fornecedor, obra ou pedido"
            className={`min-h-11 w-full rounded-xl border border-linha bg-superficie px-3 text-sm text-texto md:w-80 ${FOCO}`}
          />
        </form>
      </div>

      {aba === "a-comprar" ? (
        <section aria-label="A comprar" className="painel p-4 md:p-6">
          {aComprar.length === 0 ? (
            <p className="text-sm text-texto-2">Nenhuma obra esperando Compras.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha">
              {aComprar.map((o) => (
                <li key={o.obraId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="rounded-full bg-superficie-2 px-2.5 py-1 text-xs font-medium text-texto tabular-nums">#{o.numero}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/obras/${o.obraId}`} className="font-medium text-texto hover:underline">
                      {o.clienteNome}
                      {o.cidade && <> · {o.cidade}</>}
                    </Link>
                    <p className="text-xs text-texto-2">
                      {o.potenciaKwp != null && <>{o.potenciaKwp.toLocaleString("pt-BR")} kWp · </>}
                      {o.status === "a_comprar" ? "Aguardando Compras" : "Em cotação"}
                      {o.desde && <> há {Math.max(0, diasEntre(o.desde.slice(0, 10), hoje))} dias</>}
                      {o.responsavel && <> · {o.souResponsavel ? "com você" : o.responsavel}</>}
                    </p>
                  </div>
                  {o.status === "a_comprar" ? (
                    <IniciarCompra obraId={o.obraId} />
                  ) : (
                    dados.obrasParaPedido.some((x) => x.id === o.obraId) && (
                      <Link
                        href={`/compras/pedido?obra=${o.obraId}`}
                        className="inline-flex min-h-9 items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium text-texto hover:border-dourado"
                      >
                        Criar pedido
                      </Link>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label={ABAS_COMPRAS.find((a) => a.valor === aba)?.rotulo} className="painel overflow-hidden">
          {pedidos.length === 0 ? (
            <p className="p-6 text-sm text-texto-2">{busca ? "Nenhum pedido encontrado." : "Nenhum pedido aqui."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-linha text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium md:px-6">Pedido</th>
                    <th className="px-3 py-2 font-medium">Fornecedor</th>
                    <th className="px-3 py-2 font-medium">Obra</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Entrega</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                    <th className="px-4 py-2 md:px-6">
                      <span className="sr-only">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => {
                    const s = situacaoPedido(p);
                    const atrasada = entregaAtrasada(p, hoje);
                    const acao = s === "aguardando_nf" ? "Registrar nota fiscal" : s === "faturado" || s === "recebido_parcial" ? "Registrar recebimento" : "Ver na obra";
                    return (
                      <tr key={p.id} className="border-b border-linha last:border-b-0">
                        <td className="px-4 py-3 md:px-6">
                          <span className="font-semibold text-texto tabular-nums">{numeroPedido(p.numero)}</span>
                          <span className="block text-xs text-texto-2">{dataCurta(p.criadoEm.slice(0, 10))}</span>
                        </td>
                        <td className="px-3 py-3 font-medium text-texto">{p.fornecedor}</td>
                        <td className="px-3 py-3 text-texto-2">
                          {p.clienteNome ?? "Obra"}
                          {p.obraNumero != null && <> · #{p.obraNumero}</>}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{formatarMoeda(p.valorTotal)}</td>
                        <td className="px-3 py-3 tabular-nums">{dataCurta(p.entregaPrevista)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                              atrasada ? "bg-dourado/20 text-dourado-texto" : s === "recebido" ? "bg-energia/10 text-energia" : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {atrasada ? `Atrasada ${Math.max(1, diasEntre(p.entregaPrevista, hoje))} ${diasEntre(p.entregaPrevista, hoje) === 1 ? "dia" : "dias"}` : ROTULO_SITUACAO_PEDIDO[s]}
                          </span>
                        </td>
                        <td className="px-4 py-3 md:px-6">
                          <Link
                            href={`/obras/${p.obraId}#pedidos-compra`}
                            className="inline-flex min-h-9 items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium whitespace-nowrap text-texto hover:border-dourado"
                          >
                            {p.podeEscrever ? acao : "Ver na obra"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        O status de Compras da obra anda sozinho: o primeiro pedido marca &quot;Pedido realizado&quot;; a nota fiscal de todos os pedidos marca &quot;Faturado pelo
        fornecedor&quot; e lança a conta a pagar no Financeiro; tudo recebido marca &quot;Material entregue&quot;.
      </p>
    </div>
  );
}
