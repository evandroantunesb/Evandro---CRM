import "server-only";
import { statusItem, type ItemEngenhariaVM } from "@/lib/engenharia-checklist-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Checklist aplicado na obra e as versões dos documentos. A RLS decide: o checklist vem para quem vê a obra; os
 * documentos, só para admin e quem atua em Engenharia nela (para os demais a lista chega vazia).
 */
export async function carregarChecklistEngenharia(
  supabase: SupabaseServidor,
  { empresaId, obraId }: { empresaId: string; obraId: string },
): Promise<ItemEngenhariaVM[]> {
  const [{ data: itens, error }, { data: documentos }, { data: identidades }] = await Promise.all([
    supabase
      .from("obra_engenharia_itens")
      .select("id, grupo, titulo, descricao, obrigatorio, status, motivo, atualizado_por, atualizado_em")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("ordem")
      .order("titulo"),
    supabase
      .from("obra_engenharia_documentos")
      .select("id, item_id, nome, versao, enviado_por, created_at")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("versao", { ascending: false }),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  if (error) throw error;
  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));
  const nome = (id: string | null) => (id ? (nomes.get(id) ?? "Membro") : null);

  return (itens ?? []).map((i) => ({
    id: i.id,
    grupo: i.grupo,
    titulo: i.titulo,
    descricao: i.descricao,
    obrigatorio: i.obrigatorio,
    status: statusItem(i.status),
    motivo: i.motivo,
    atualizadoPor: nome(i.atualizado_por),
    atualizadoEm: i.atualizado_em,
    documentos: (documentos ?? [])
      .filter((d) => d.item_id === i.id)
      .map((d) => ({ id: d.id, nome: d.nome, versao: d.versao, enviadoPor: nome(d.enviado_por), quando: d.created_at })),
  }));
}
