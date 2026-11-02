import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Desconto à vista do negócio na ficha (20261102200000_descontos_aprovacao.sql): os últimos pedidos, o limite de quem
 * vê e se pode decidir o pedido pendente (a regra fica no banco: admin, ou gestor da equipe até o próprio limite).
 */
export async function carregarDescontoNegocio(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, empresaId: string, negocioId: string) {
  const [pedidosRes, limiteRes] = await Promise.all([
    supabase
      .from("descontos_solicitacoes")
      .select("id, percentual, motivo, status, solicitado_por, decidido_por, decidido_em, motivo_decisao, created_at")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("meu_limite_desconto", { p_empresa_id: empresaId }),
  ]);
  if (pedidosRes.error) throw pedidosRes.error;
  const pedidos = pedidosRes.data ?? [];
  const pendente = pedidos.find((p) => p.status === "pendente");
  const { data: possoDecidir } = pendente ? await supabase.rpc("posso_decidir_desconto", { p_id: pendente.id }) : { data: false };
  return { limite: Number(limiteRes.data ?? 0), pedidos, possoDecidir: !!possoDecidir };
}
