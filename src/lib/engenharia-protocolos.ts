import "server-only";
import { statusExigencia, statusProtocolo, tipoEvento, type ProtocoloVM } from "@/lib/engenharia-protocolos-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Protocolos da obra com a linha do tempo, os arquivos, o pacote enviado e as exigências, do mais recente para o mais
 * antigo. A RLS decide: só admin e quem atua em Engenharia na obra recebem algo; para os demais, lista vazia.
 */
export async function carregarProtocolosEngenharia(
  supabase: SupabaseServidor,
  { empresaId, obraId }: { empresaId: string; obraId: string },
): Promise<ProtocoloVM[]> {
  const [{ data: protocolos, error }, { data: eventos }, { data: exigencias }, { data: arquivos }, { data: identidades }] = await Promise.all([
    supabase
      .from("obra_engenharia_protocolos")
      .select("id, distribuidora, canal, numero, tipo_solicitacao, protocolado_em, status, observacao")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false }),
    supabase
      .from("obra_engenharia_protocolo_eventos")
      .select("id, protocolo_id, tipo, ocorrido_em, descricao, autor_membro_id")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at"),
    supabase
      .from("obra_engenharia_exigencias")
      .select("id, protocolo_id, categoria, descricao, prazo_interno, status")
      .eq("empresa_id", empresaId)
      .eq("obra_id", obraId)
      .order("created_at"),
    supabase.from("obra_engenharia_protocolo_arquivos").select("id, evento_id, nome").eq("empresa_id", empresaId).eq("obra_id", obraId).order("created_at"),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  if (error) throw error;
  if (!protocolos?.length) return [];

  const idsEventos = (eventos ?? []).map((e) => e.id);
  const { data: pacote } = idsEventos.length
    ? await supabase
        .from("obra_engenharia_protocolo_documentos")
        .select("evento_id, obra_engenharia_documentos(versao, obra_engenharia_itens(titulo))")
        .in("evento_id", idsEventos)
    : { data: [] };
  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));

  return protocolos.map((p) => ({
    id: p.id,
    distribuidora: p.distribuidora,
    canal: p.canal,
    numero: p.numero,
    tipoSolicitacao: p.tipo_solicitacao,
    protocoladoEm: p.protocolado_em,
    status: statusProtocolo(p.status),
    observacao: p.observacao,
    exigencias: (exigencias ?? [])
      .filter((x) => x.protocolo_id === p.id)
      .map((x) => ({ id: x.id, categoria: x.categoria, descricao: x.descricao, prazoInterno: x.prazo_interno, status: statusExigencia(x.status) })),
    eventos: (eventos ?? [])
      .filter((e) => e.protocolo_id === p.id)
      .map((e) => ({
        id: e.id,
        tipo: tipoEvento(e.tipo),
        ocorridoEm: e.ocorrido_em,
        descricao: e.descricao,
        autor: e.autor_membro_id ? (nomes.get(e.autor_membro_id) ?? "Membro") : null,
        arquivos: (arquivos ?? []).filter((a) => a.evento_id === e.id).map((a) => ({ id: a.id, nome: a.nome })),
        pacote: (pacote ?? [])
          .filter((d) => d.evento_id === e.id && d.obra_engenharia_documentos)
          .map((d) => ({ item: d.obra_engenharia_documentos!.obra_engenharia_itens?.titulo ?? "Item", versao: d.obra_engenharia_documentos!.versao }))
          .sort((a, b) => a.item.localeCompare(b.item)),
      })),
  }));
}

/** Exigências abertas por obra (central da Engenharia). A RLS limita às obras em que a pessoa atua. */
export async function contarExigenciasAbertas(supabase: SupabaseServidor, empresaId: string): Promise<Map<string, number>> {
  const { data } = await supabase.from("obra_engenharia_exigencias").select("obra_id").eq("empresa_id", empresaId).eq("status", "aberta").limit(1000);
  const contagem = new Map<string, number>();
  for (const x of data ?? []) contagem.set(x.obra_id, (contagem.get(x.obra_id) ?? 0) + 1);
  return contagem;
}
