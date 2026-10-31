import "server-only";
import { resumoChecklist, statusItem, type ItemEngenhariaVM } from "@/lib/engenharia-checklist-regras";
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

const PAGINA_ITENS = 1000;
/** Obras por consulta: a lista de ids vai na URL. */
const BLOCO_OBRAS = 100;

/**
 * Das obras pedidas, as que passam no gate G2: checklist aplicado e obrigatórios válidos ou dispensados (a mesma
 * conferência de `registrar_protocolo_engenharia`). Pagina porque cada obra tem vários itens.
 */
export async function carregarChecklistsAptos(supabase: SupabaseServidor, empresaId: string, obraIds: readonly string[]): Promise<Set<string>> {
  const itens = new Map<string, { obrigatorio: boolean; status: ReturnType<typeof statusItem> }[]>();
  for (let b = 0; b < obraIds.length; b += BLOCO_OBRAS) {
    const bloco = obraIds.slice(b, b + BLOCO_OBRAS);
    for (let inicio = 0; ; inicio += PAGINA_ITENS) {
      const { data, error } = await supabase
        .from("obra_engenharia_itens")
        .select("obra_id, obrigatorio, status")
        .eq("empresa_id", empresaId)
        .in("obra_id", bloco)
        .order("id")
        .range(inicio, inicio + PAGINA_ITENS - 1);
      if (error) throw error;
      for (const i of data) itens.set(i.obra_id, [...(itens.get(i.obra_id) ?? []), { obrigatorio: i.obrigatorio, status: statusItem(i.status) }]);
      if (data.length < PAGINA_ITENS) break;
    }
  }
  const aptos = new Set<string>();
  for (const [obraId, lista] of itens) {
    const r = resumoChecklist(lista);
    if (r.obrigatoriosResolvidos === r.obrigatorios) aptos.add(obraId);
  }
  return aptos;
}
