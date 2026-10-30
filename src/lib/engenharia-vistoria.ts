import "server-only";
import { acaoVistoria, statusVistoria, tipoEventoVistoria, type SituacaoVistoria, type VistoriaVM } from "@/lib/engenharia-vistoria-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Pedidos de vistoria da obra com a linha do tempo e os arquivos, do mais recente para o mais antigo. A RLS decide:
 * só admin e quem atua em Engenharia na obra recebem algo; para os demais, lista vazia.
 */
export async function carregarVistoriasEngenharia(
  supabase: SupabaseServidor,
  { empresaId, obraId }: { empresaId: string; obraId: string },
): Promise<VistoriaVM[]> {
  const [{ data: vistorias, error }, { data: eventos }, { data: arquivos }, { data: identidades }] = await Promise.all([
    supabase
      .from("obra_engenharia_vistorias")
      .select("id, numero, status, solicitada_em, agendada_para, realizada_em, medidor_adequado_em, conexao_confirmada_em")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false }),
    supabase
      .from("obra_engenharia_vistoria_eventos")
      .select("id, vistoria_id, tipo, ocorrido_em, descricao, autor_membro_id")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at"),
    supabase.from("obra_engenharia_vistoria_arquivos").select("id, evento_id, nome").eq("empresa_id", empresaId).eq("obra_id", obraId).order("created_at"),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  if (error) throw error;
  if (!vistorias?.length) return [];
  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));

  return vistorias.map((v) => ({
    id: v.id,
    numero: v.numero,
    status: statusVistoria(v.status),
    solicitadaEm: v.solicitada_em,
    agendadaPara: v.agendada_para,
    realizadaEm: v.realizada_em,
    medidorAdequadoEm: v.medidor_adequado_em,
    conexaoConfirmadaEm: v.conexao_confirmada_em,
    eventos: (eventos ?? [])
      .filter((e) => e.vistoria_id === v.id)
      .map((e) => ({
        id: e.id,
        tipo: tipoEventoVistoria(e.tipo),
        ocorridoEm: e.ocorrido_em,
        descricao: e.descricao,
        autor: e.autor_membro_id ? (nomes.get(e.autor_membro_id) ?? "Membro") : null,
        arquivos: (arquivos ?? []).filter((a) => a.evento_id === e.id).map((a) => ({ id: a.id, nome: a.nome })),
      })),
  }));
}

/** Situação e datas da vistoria mais recente, para quem vê a obra (Operacional, comercial). Null se não há. */
export async function carregarSituacaoVistoria(supabase: SupabaseServidor, obraId: string): Promise<SituacaoVistoria | null> {
  const { data } = await supabase.rpc("situacao_vistoria_obra", { p_obra_id: obraId });
  const v = data?.[0];
  if (!v) return null;
  return {
    status: statusVistoria(v.status),
    solicitadaEm: v.solicitada_em,
    agendadaPara: v.agendada_para,
    realizadaEm: v.realizada_em,
    medidorAdequadoEm: v.medidor_adequado_em,
    conexaoConfirmadaEm: v.conexao_confirmada_em,
  };
}

/** Ação que a vistoria mais recente pede, por obra (central da Engenharia). A RLS limita às obras em que a pessoa atua. */
export async function carregarAcoesVistoria(supabase: SupabaseServidor, empresaId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("obra_engenharia_vistorias")
    .select("obra_id, status, conexao_confirmada_em")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const acoes = new Map<string, string>();
  const vistas = new Set<string>();
  for (const v of data ?? []) {
    if (vistas.has(v.obra_id)) continue;
    vistas.add(v.obra_id);
    const acao = acaoVistoria({ status: statusVistoria(v.status), conexaoConfirmadaEm: v.conexao_confirmada_em });
    if (acao) acoes.set(v.obra_id, acao);
  }
  return acoes;
}
