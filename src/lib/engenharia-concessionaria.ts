import "server-only";
import type { CanalConcessionaria } from "@/lib/engenharia-enquadramento-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/** Concessionária cadastrada na empresa (20261223100000_concessionarias.sql); `distribuidora` = sigla da ANEEL. */
export type ConcessionariaOpcao = { id: string; nome: string; distribuidora: string };

/**
 * Concessionárias da empresa, por nome, para o aviso e o seletor da Engenharia e para Configurações › Engenharia. A da
 * obra vem em `ObraDetalheVM.concessionariaId` (o papel `operacao` só lê obras pela RPC `obras_operacao`). RLS: membro
 * ativo.
 */
export async function carregarConcessionarias(supabase: SupabaseServidor, empresaId: string): Promise<ConcessionariaOpcao[]> {
  const { data, error } = await supabase.from("concessionarias").select("id, nome, distribuidora").eq("empresa_id", empresaId).order("nome");
  if (error) throw error;
  return data;
}

/** Canais de entrada da concessionária (20261224100000), pela ordem; inclui os inativos (a tela decide). */
export async function carregarCanais(
  supabase: SupabaseServidor,
  { empresaId, concessionariaId }: { empresaId: string; concessionariaId: string },
): Promise<CanalConcessionaria[]> {
  const { data, error } = await supabase
    .from("concessionaria_canais")
    .select("id, nome, ordem, ativo, tipos, tensoes")
    .eq("empresa_id", empresaId)
    .eq("concessionaria_id", concessionariaId)
    .order("ordem")
    .order("nome");
  if (error) throw error;
  return data;
}

/** A obra já teve envio (regra 7: trocar a concessionária não troca o checklist)? Pela RPC, mesma regra do banco. */
export async function checklistEnviado(supabase: SupabaseServidor, obraId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("checklist_engenharia_enviado", { p_obra_id: obraId });
  if (error) throw error;
  return data === true;
}

/**
 * Concessionária de onde veio o checklist já aplicado à obra (pelo modelo dos itens); nula sem checklist. Diferente da
 * concessionária da obra quando ela foi trocada depois de algum envio (regra 7): a tela avisa.
 */
export async function concessionariaDoChecklist(supabase: SupabaseServidor, obraId: string): Promise<string | null> {
  const { data: item, error } = await supabase.from("obra_engenharia_itens").select("modelo_id").eq("obra_id", obraId).limit(1).maybeSingle();
  if (error) throw error;
  if (!item?.modelo_id) return null;
  const { data: modelo, error: erroModelo } = await supabase
    .from("engenharia_checklist_modelo")
    .select("concessionaria_id")
    .eq("id", item.modelo_id)
    .maybeSingle();
  if (erroModelo) throw erroModelo;
  return modelo?.concessionaria_id ?? null;
}
