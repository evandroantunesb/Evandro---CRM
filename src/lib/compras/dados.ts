import "server-only";
import { carregarObras } from "@/lib/obras/dados";
import { autorizacaoSetor, type SetorDoMembro } from "@/lib/obras/gestao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { ehCategoria, kitDaObra, type ItemKitCompra, type ObraAComprarVM, type PedidoVM } from "./regras";

/**
 * Dados de Compras (20261125100000_compras_pedidos.sql). A RLS decide o que cada pessoa lê (`pode_ver_pedidos_compra`:
 * quem atua em Compras na obra e quem vê os custos dela); aqui só se juntam as obras e se marca onde a pessoa pode
 * escrever, com a mesma regra de `autorizacao_setor_obra` (o banco confere de novo em cada RPC).
 */

const LIMITE_LINHAS = 1000;

const COLUNAS_PEDIDO =
  "id, obra_id, numero, fornecedor, categoria, entrega_prevista, vencimento, numero_fornecedor, frete, frete_modalidade, valor_total, faturar_para, entrega_endereco, entrega_recebe, entrega_telefone, observacao, nf_numero, nf_valor, nf_registrada_em, cancelado_em, motivo_cancelamento, created_at";

type LinhaPedido = {
  id: string;
  obra_id: string;
  numero: number;
  fornecedor: string;
  categoria: string;
  entrega_prevista: string;
  vencimento: string;
  numero_fornecedor: string | null;
  frete: number | string;
  frete_modalidade: string;
  valor_total: number | string;
  faturar_para: string;
  entrega_endereco: string | null;
  entrega_recebe: string | null;
  entrega_telefone: string | null;
  observacao: string | null;
  nf_numero: string | null;
  nf_valor: number | string | null;
  nf_registrada_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
};
type LinhaItem = {
  id: string;
  pedido_id: string;
  kit_indice: number | null;
  descricao: string;
  unidade: string;
  quantidade: number | string;
  valor_unitario: number | string;
  quantidade_recebida: number | string;
};

function montarPedidos(linhas: readonly LinhaPedido[], itens: readonly LinhaItem[]): PedidoVM[] {
  const porPedido = new Map<string, LinhaItem[]>();
  for (const i of itens) porPedido.set(i.pedido_id, [...(porPedido.get(i.pedido_id) ?? []), i]);
  return linhas.flatMap((l): PedidoVM[] =>
    ehCategoria(l.categoria)
      ? [
          {
            id: l.id,
            obraId: l.obra_id,
            numero: l.numero,
            fornecedor: l.fornecedor,
            categoria: l.categoria,
            entregaPrevista: l.entrega_prevista,
            vencimento: l.vencimento,
            numeroFornecedor: l.numero_fornecedor,
            frete: Number(l.frete),
            freteModalidade: l.frete_modalidade === "fob" ? "fob" : "cif",
            valorTotal: Number(l.valor_total),
            faturarPara: l.faturar_para === "empresa" ? "empresa" : "cliente",
            observacao: l.observacao,
            entrega: l.entrega_endereco ? { endereco: l.entrega_endereco, recebe: l.entrega_recebe ?? "", telefone: l.entrega_telefone } : null,
            nfNumero: l.nf_numero,
            nfValor: l.nf_valor == null ? null : Number(l.nf_valor),
            temNf: l.nf_registrada_em != null,
            cancelado: l.cancelado_em != null,
            motivoCancelamento: l.motivo_cancelamento,
            criadoEm: l.created_at,
            itens: (porPedido.get(l.id) ?? []).map((i) => ({
              id: i.id,
              kitIndice: i.kit_indice,
              descricao: i.descricao,
              unidade: i.unidade,
              quantidade: Number(i.quantidade),
              valorUnitario: Number(i.valor_unitario),
              quantidadeRecebida: Number(i.quantidade_recebida),
            })),
          },
        ]
      : [],
  );
}

/** Pedidos da empresa (ou de uma obra), mais novos primeiro, com os itens. */
export async function carregarPedidos(supabase: SupabaseServidor, { empresaId, obraId }: { empresaId: string; obraId?: string }): Promise<PedidoVM[]> {
  let consulta = supabase.from("compras_pedidos").select(COLUNAS_PEDIDO).eq("empresa_id", empresaId);
  if (obraId) consulta = consulta.eq("obra_id", obraId);
  const { data: linhas, error } = await consulta.order("created_at", { ascending: false }).limit(LIMITE_LINHAS);
  if (error) throw error;
  if (!linhas?.length) return [];
  const { data: itens, error: erroItens } = await supabase
    .from("compras_pedido_itens")
    .select("id, pedido_id, kit_indice, descricao, unidade, quantidade, valor_unitario, quantidade_recebida")
    .in(
      "pedido_id",
      linhas.map((l) => l.id),
    )
    .order("ordem");
  if (erroItens) throw erroItens;
  return montarPedidos(linhas, itens ?? []);
}

/** Setor que atua como Compras na empresa e os setores do membro (só o papel `operacao` precisa). */
export async function minhaAtuacaoCompras(supabase: SupabaseServidor, empresaId: string, papel: string, membroId: string) {
  if (papel === "admin" || papel === "gestor") return { setores: [] as SetorDoMembro[], setorAtende: "compras" as string | null, atuo: true };
  if (papel === "operacao") return minhaAtuacaoOperacao(supabase, empresaId, membroId);
  return { setores: [] as SetorDoMembro[], setorAtende: null, atuo: false };
}

async function minhaAtuacaoOperacao(supabase: SupabaseServidor, empresaId: string, membroId: string) {
  const [setoresRes, atendeRes] = await Promise.all([
    supabase.from("membro_setores_obra").select("setor, capacidade").eq("empresa_id", empresaId).eq("membro_id", membroId),
    supabase.rpc("setor_atende_compras", { p_empresa_id: empresaId }),
  ]);
  if (setoresRes.error) throw setoresRes.error;
  if (atendeRes.error) throw atendeRes.error;
  const setores = (setoresRes.data ?? []) as SetorDoMembro[];
  const setorAtende = atendeRes.data ?? null;
  return { setores, setorAtende, atuo: setorAtende != null && setores.some((s) => s.setor === setorAtende) };
}

/** Quem vê a tela /compras: admin, gestor e quem atua em Compras (ou no setor que atende no lugar dele). */
export async function acessaCompras(supabase: SupabaseServidor, empresaId: string, papel: string | null | undefined): Promise<boolean> {
  if (papel === "admin" || papel === "gestor") return true;
  if (papel === "operacao") {
    const { data, error } = await supabase.rpc("atuo_em_compras", { p_empresa_id: empresaId });
    if (error) throw error;
    return data === true;
  }
  return false;
}

export type PedidoComObraVM = PedidoVM & { obraNumero: number | null; clienteNome: string | null; podeEscrever: boolean };

export type TelaComprasVM = {
  pedidos: PedidoComObraVM[];
  aComprar: ObraAComprarVM[];
  /** Obras em cotação ou já com pedido, em que a pessoa pode fazer pedido. */
  obrasParaPedido: { id: string; rotulo: string }[];
};

export async function carregarTelaCompras(
  supabase: SupabaseServidor,
  { empresaId, papel, membroId }: { empresaId: string; papel: string; membroId: string },
): Promise<TelaComprasVM> {
  const [{ obras }, pedidos, atuacao, participacoesRes] = await Promise.all([
    carregarObras(supabase, { empresaId, papel, membroId }),
    carregarPedidos(supabase, { empresaId }),
    minhaAtuacaoCompras(supabase, empresaId, papel, membroId),
    papel === "operacao"
      ? supabase.from("obra_participantes").select("obra_id").eq("empresa_id", empresaId).eq("membro_id", membroId).eq("setor", "compras").is("fim", null)
      : Promise.resolve({ data: [] as { obra_id: string }[], error: null }),
  ]);
  if (participacoesRes.error) throw participacoesRes.error;
  const participando = new Set((participacoesRes.data ?? []).map((p) => p.obra_id));
  const podeEscrever = (obraId: string) =>
    autorizacaoSetor(
      { papel, setoresDoMembro: atuacao.setores, setoresParticipando: participando.has(obraId) ? ["compras"] : [], setorAtendeCompras: atuacao.setorAtende },
      "compras",
    ) != null;

  const porId = new Map(obras.map((o) => [o.id, o]));
  const comObra = pedidos.map((p): PedidoComObraVM => {
    const o = porId.get(p.obraId);
    return { ...p, obraNumero: o?.numero ?? null, clienteNome: o?.clienteNome ?? null, podeEscrever: !!o && o.situacao !== "cancelada" && podeEscrever(p.obraId) };
  });

  const aComprar = obras.flatMap((o): ObraAComprarVM[] => {
    const c = o.setores.find((s) => s.setor === "compras");
    if (o.situacao === "cancelada" || o.situacao === "concluida" || !c || (c.status !== "a_comprar" && c.status !== "cotando")) return [];
    return [
      {
        obraId: o.id,
        numero: o.numero,
        clienteNome: o.clienteNome,
        cidade: [o.cidade, o.uf].filter(Boolean).join("/") || null,
        potenciaKwp: o.potenciaKwp,
        status: c.status,
        desde: c.statusDesde,
        responsavel: c.principalNome,
        souResponsavel: c.souPrincipal,
      },
    ];
  });
  aComprar.sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? ""));

  const obrasParaPedido = obras
    .filter((o) => {
      const status = o.setores.find((s) => s.setor === "compras")?.status;
      return o.situacao === "em_andamento" && status != null && status !== "a_comprar" && podeEscrever(o.id);
    })
    .map((o) => ({ id: o.id, rotulo: `${o.clienteNome} · obra #${o.numero}` }));

  return { pedidos: comObra, aComprar, obrasParaPedido };
}

export type ObraParaPedidoVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  kit: ItemKitCompra[];
  /** Planejado de cada categoria na venda (`obra_orcamento`); vazio para quem não vê os custos. */
  orcamento: Partial<Record<string, number>>;
};

/** A obra para o formulário do pedido: identificação e o kit vendido gravado nela. Nulo sem acesso. */
export async function carregarObraParaPedido(supabase: SupabaseServidor, { papel, obraId }: { papel: string; obraId: string }): Promise<ObraParaPedidoVM | null> {
  const [obraRes, orcamentoRes] = await Promise.all([
    papel === "operacao"
      ? supabase.rpc("obras_operacao", { p_obra_id: obraId }).then((r) => ({ data: r.data?.[0] ? { id: r.data[0].obra_id, ...r.data[0] } : null, error: r.error }))
      : supabase.from("obras").select("id, numero, cliente_nome, cidade, uf, snapshot").eq("id", obraId).maybeSingle(),
    supabase.from("obra_orcamento").select("categoria, planejado").eq("obra_id", obraId),
  ]);
  if (obraRes.error) throw obraRes.error;
  if (orcamentoRes.error) throw orcamentoRes.error;
  const o = obraRes.data;
  if (!o) return null;
  return {
    id: o.id,
    numero: o.numero,
    clienteNome: o.cliente_nome,
    cidade: [o.cidade, o.uf].filter(Boolean).join("/") || null,
    kit: kitDaObra(o.snapshot),
    orcamento: Object.fromEntries((orcamentoRes.data ?? []).map((l) => [l.categoria, Number(l.planejado)])),
  };
}

/** Fornecedores já usados nos pedidos e nas contas (sugestão do campo, nome livre). */
export async function carregarFornecedores(supabase: SupabaseServidor, empresaId: string): Promise<string[]> {
  const [p, c] = await Promise.all([
    supabase.from("compras_pedidos").select("fornecedor").eq("empresa_id", empresaId).limit(LIMITE_LINHAS),
    supabase.from("obra_contas_pagar").select("fornecedor").eq("empresa_id", empresaId).limit(LIMITE_LINHAS),
  ]);
  return [...new Set([...(p.data ?? []), ...(c.data ?? [])].map((l) => l.fornecedor.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
