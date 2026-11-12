import "server-only";
import { resumoDescontoGestor, type ResumoDescontoGestor } from "@/lib/descontos-resumo";
import type { criarClienteServidor } from "@/lib/supabase/server";
import type { TipoComponenteKit } from "@/lib/tipos";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/**
 * Desconto do negócio na ficha (20261102200000_descontos_aprovacao.sql e, sobre o preço sugerido, Compras P4c em
 * 20261202100000_desconto_sobre_sugerido.sql): os últimos pedidos, o limite de quem vê, se pode decidir o pedido
 * pendente (a regra fica no banco: admin, ou gestor da equipe até o próprio limite) e, para quem decide e vê a tabela
 * de preços, o resumo de custo e sobra do pedido.
 */
export async function carregarDescontoNegocio(supabase: Supabase, empresaId: string, negocioId: string) {
  const [pedidosRes, limiteRes] = await Promise.all([
    supabase
      .from("descontos_solicitacoes")
      .select("id, percentual, motivo, status, solicitado_por, decidido_por, decidido_em, motivo_decisao, created_at, preco_sugerido")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("meu_limite_desconto", { p_empresa_id: empresaId }),
  ]);
  if (pedidosRes.error) throw pedidosRes.error;
  const pedidos = pedidosRes.data ?? [];
  const pendente = pedidos.find((p) => p.status === "pendente");
  const { data: possoDecidir } = pendente ? await supabase.rpc("posso_decidir_desconto", { p_id: pendente.id }) : { data: false };
  const resumo =
    possoDecidir && pendente?.preco_sugerido != null
      ? await carregarResumoGestor(supabase, empresaId, negocioId, Number(pendente.preco_sugerido), Number(pendente.percentual))
      : null;
  return { limite: Number(limiteRes.data ?? 0), pedidos, possoDecidir: !!possoDecidir, resumo };
}

/** Nulo quando quem decide não vê o custo do kit (RLS de `negocio_custo_kit`) ou faltam os parâmetros. */
async function carregarResumoGestor(
  supabase: Supabase,
  empresaId: string,
  negocioId: string,
  sugerido: number,
  percentual: number,
): Promise<ResumoDescontoGestor | null> {
  const [custoRes, kitRes, parametrosRes] = await Promise.all([
    supabase.from("negocio_custo_kit").select("custo_itens, parcial").eq("negocio_id", negocioId).maybeSingle(),
    supabase.from("kit_componentes").select("tipo, quantidade, potencia_w").eq("negocio_id", negocioId),
    supabase
      .from("parametros_calculadora")
      .select("custo_instalacao_por_modulo, custo_material_ca_por_kwp, custo_engenharia, comissao_percentual")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  const custo = custoRes.data;
  const p = parametrosRes.data;
  if (custoRes.error || kitRes.error || parametrosRes.error || !custo || !p) return null;
  return resumoDescontoGestor({
    sugerido,
    percentual,
    custoItens: Number(custo.custo_itens),
    custoParcial: custo.parcial,
    kit: (kitRes.data ?? []).map((k) => ({
      tipo: k.tipo as TipoComponenteKit,
      quantidade: k.quantidade,
      potenciaW: k.potencia_w == null ? null : Number(k.potencia_w),
    })),
    parametros: {
      custoInstalacaoPorModulo: Number(p.custo_instalacao_por_modulo),
      custoMaterialCaPorKwp: Number(p.custo_material_ca_por_kwp),
      custoEngenharia: Number(p.custo_engenharia),
      comissaoPercentual: Number(p.comissao_percentual),
    },
  });
}

/** Pedidos de desconto que quem está logado pode decidir (Início do gestor e do admin). */
export async function carregarDescontosParaAprovar(supabase: Supabase, empresaId: string) {
  const { data, error } = await supabase.rpc("descontos_para_aprovar", { p_empresa_id: empresaId });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    negocioId: d.negocio_id,
    titulo: d.titulo,
    solicitante: d.solicitante,
    percentual: Number(d.percentual),
    precoSugerido: d.preco_sugerido == null ? null : Number(d.preco_sugerido),
    criadoEm: d.created_at,
  }));
}
