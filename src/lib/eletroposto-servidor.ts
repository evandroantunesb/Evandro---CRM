import "server-only";
import type { Atual } from "@/lib/negocios-gravacao";
import { PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Eletroposto disponível para quem está usando: módulo ligado na empresa (`empresas.eletroposto_ativo`) e papel
 * que gera proposta (SDR não). Com ele, "Novo negócio" sempre pede a escolha entre solar e eletroposto.
 */
export async function eletropostoDisponivel(supabase: SupabaseServidor, atual: Pick<Atual, "empresaId" | "papel">): Promise<boolean> {
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return false;
  const { data } = await supabase.from("empresas").select("eletroposto_ativo").eq("id", atual.empresaId).maybeSingle();
  return !!data?.eletroposto_ativo;
}
