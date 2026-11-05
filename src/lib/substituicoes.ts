import "server-only";
import { SETOR_ETAPA, type EtapaObra } from "@/lib/obras/cronograma";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { Substituicao } from "@/lib/tarefas-setor-regras";

/** Pedidos de justificativa pendentes comigo: feitos a mim ou, nas obras em que substituo, ao principal. */
export async function carregarJustificativasComigo(supabase: SupabaseServidor, empresaId: string, membroId: string, substituicoes: readonly Substituicao[]) {
  const obras = [...new Set(substituicoes.map((s) => s.obraId))];
  const { data, error } = await supabase
    .from("obra_justificativas_atraso")
    .select("id, obra_id, etapa, prazo, pedido_a")
    .eq("empresa_id", empresaId)
    .or(obras.length ? `pedido_a.eq.${membroId},obra_id.in.(${obras.join(",")})` : `pedido_a.eq.${membroId}`)
    .is("respondido_em", null);
  if (error) throw error;
  // Pedido a outra pessoa só entra se eu substituo o setor da etapa naquela obra.
  return (data ?? []).filter(
    (j) => j.pedido_a === membroId || substituicoes.some((s) => s.obraId === j.obra_id && s.setor === SETOR_ETAPA[j.etapa as EtapaObra]),
  );
}

/**
 * Onde a sessão é o substituto do setor numa obra (20261123100000_substituto_obra.sql): obra, setor e o responsável
 * principal. Só `operacao` participa de obra: com o papel informado, só ele consulta (sem o papel, a RPC decide).
 */
export async function carregarSubstituicoes(supabase: SupabaseServidor, empresaId: string, papel?: string | null): Promise<Substituicao[]> {
  // Lista positiva: consulta sem papel informado ou com `operacao`; qualquer outro papel não tem substituição.
  const consulta = papel === undefined || papel === "operacao";
  if (!consulta) return [];
  const { data, error } = await supabase.rpc("minhas_substituicoes", { p_empresa_id: empresaId });
  if (error) throw error;
  return (data ?? []).map((s) => ({ obraId: s.obra_id, setor: s.setor, principalId: s.principal_id }));
}
