import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";

/** Concessionária cadastrada na empresa (20261223100000_concessionarias.sql). */
export type ConcessionariaOpcao = { id: string; nome: string };

/**
 * Concessionárias da empresa, por nome, para o aviso e o seletor da Engenharia. A da obra vem em
 * `ObraDetalheVM.concessionariaId` (o papel `operacao` só lê obras pela RPC `obras_operacao`). RLS: membro ativo.
 */
export async function carregarConcessionarias(supabase: SupabaseServidor, empresaId: string): Promise<ConcessionariaOpcao[]> {
  const { data, error } = await supabase.from("concessionarias").select("id, nome").eq("empresa_id", empresaId).order("nome");
  if (error) throw error;
  return data;
}
