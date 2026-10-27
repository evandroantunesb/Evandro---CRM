import "server-only";
import type { Atual } from "@/lib/negocios-gravacao";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Eletroposto disponível para quem está usando: módulo ligado na empresa (`empresas.eletroposto_ativo`). Vale para
 * todos os papéis: o SDR também abre negócio de eletroposto (sem modelos nem proposta). Com ele, "Novo negócio"
 * sempre pede a escolha entre solar e eletroposto.
 */
export async function eletropostoDisponivel(supabase: SupabaseServidor, atual: Pick<Atual, "empresaId" | "papel">): Promise<boolean> {
  const { data } = await supabase.from("empresas").select("eletroposto_ativo").eq("id", atual.empresaId).maybeSingle();
  return !!data?.eletroposto_ativo;
}
