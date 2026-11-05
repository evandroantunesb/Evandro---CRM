import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";

/** Setores que a pessoa coordena (`membro_setores_obra`, capacidade "coordenar"). Só `operacao` tem setores. */
export async function carregarSetoresCoordenados(
  supabase: SupabaseServidor,
  { empresaId, membroId, papel }: { empresaId: string; membroId: string; papel: string | null | undefined },
): Promise<string[]> {
  // Lista positiva: só `operacao` consulta; admin e gestor coordenam tudo sem precisar de linha.
  const temSetores = papel === "operacao";
  if (!temSetores) return [];
  const { data, error } = await supabase
    .from("membro_setores_obra")
    .select("setor")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .eq("capacidade", "coordenar");
  if (error) throw error;
  return (data ?? []).map((s) => s.setor);
}
