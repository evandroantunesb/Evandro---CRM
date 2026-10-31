import "server-only";
import { acaoPasso, ehPassoComRegistro, type PassoComRegistro, type RegistroPassoVM } from "@/lib/engenharia-passos-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Registro mais recente de cada passo com registro (2, 3, 5 e 7) da obra, com o nome de quem registrou. A RLS decide:
 * vem para quem vê a obra.
 */
export async function carregarRegistrosPassos(
  supabase: SupabaseServidor,
  { empresaId, obraId }: { empresaId: string; obraId: string },
): Promise<Partial<Record<PassoComRegistro, RegistroPassoVM>>> {
  const [{ data, error }, { data: identidades }] = await Promise.all([
    supabase
      .from("obra_engenharia_passo_registros")
      .select("id, passo, acao, observacao, autor_membro_id, created_at")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  if (error) throw error;
  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));
  const registros: Partial<Record<PassoComRegistro, RegistroPassoVM>> = {};
  for (const r of data ?? []) {
    if (!ehPassoComRegistro(r.passo) || registros[r.passo]) continue;
    registros[r.passo] = {
      id: r.id,
      passo: r.passo,
      acao: acaoPasso(r.acao),
      observacao: r.observacao,
      autor: r.autor_membro_id ? (nomes.get(r.autor_membro_id) ?? null) : null,
      quando: r.created_at,
    };
  }
  return registros;
}
