import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { TIPOS_EVENTO, type EventoAgenda, type TipoEvento } from "@/lib/obras/agenda-regras";

/** Agenda operacional do período (`agenda_operacional`): o banco filtra pelas obras que quem pede vê. */
export async function carregarAgenda(supabase: SupabaseServidor, empresaId: string, de: string, ate: string): Promise<EventoAgenda[]> {
  const { data, error } = await supabase.rpc("agenda_operacional", { p_empresa_id: empresaId, p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? [])
    .filter((l) => (TIPOS_EVENTO as readonly string[]).includes(l.tipo))
    .map((l) => ({
      tipo: l.tipo as TipoEvento,
      obraId: l.obra_id,
      obraNumero: l.obra_numero,
      clienteNome: l.cliente_nome,
      inicio: l.inicio,
      fim: l.fim,
      detalhe: l.detalhe,
      equipeId: l.equipe_id,
      situacao: l.situacao,
      alerta: l.alerta,
    }));
}

export async function carregarFeriadosPeriodo(supabase: SupabaseServidor, empresaId: string, de: string, ate: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("feriados_periodo", { p_empresa_id: empresaId, p_de: de, p_ate: ate });
  if (error) throw error;
  return new Map((data ?? []).map((f) => [f.data, f.nome]));
}

export type EquipeInstalacao = { id: string; nome: string; telefone: string | null; ativa: boolean };

export async function carregarEquipesInstalacao(supabase: SupabaseServidor, empresaId: string): Promise<EquipeInstalacao[]> {
  const { data, error } = await supabase
    .from("equipes_instalacao")
    .select("id, nome, telefone, ativa")
    .eq("empresa_id", empresaId)
    .order("ativa", { ascending: false })
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export type InstalacaoObra = {
  equipeId: string | null;
  equipeNome: string;
  equipeTelefone: string | null;
  inicio: string;
  termino: string;
  observacao: string | null;
};

export type HistoricoInstalacao = { quando: string; autor: string; dados: Record<string, unknown> };

/** Agendamento da obra e o histórico dele (o histórico vem de `obra_historico`, já filtrado pela RLS da obra). */
export async function carregarInstalacaoObra(
  supabase: SupabaseServidor,
  obraId: string,
  nomes: Map<string, string>,
): Promise<{ instalacao: InstalacaoObra | null; historico: HistoricoInstalacao[] }> {
  const [agenda, historico] = await Promise.all([
    supabase.from("obra_instalacoes").select("equipe_id, equipe_nome, equipe_telefone, inicio, termino, observacao").eq("obra_id", obraId).maybeSingle(),
    supabase
      .from("obra_historico")
      .select("created_at, autor_membro_id, dados")
      .eq("obra_id", obraId)
      .eq("tipo", "instalacao_agendamento")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (agenda.error) throw agenda.error;
  if (historico.error) throw historico.error;
  const a = agenda.data;
  return {
    instalacao: a
      ? { equipeId: a.equipe_id, equipeNome: a.equipe_nome, equipeTelefone: a.equipe_telefone, inicio: a.inicio, termino: a.termino, observacao: a.observacao }
      : null,
    historico: (historico.data ?? []).map((h) => ({
      quando: h.created_at,
      autor: (h.autor_membro_id && nomes.get(h.autor_membro_id)) || "Usuário não identificado",
      dados: (h.dados ?? {}) as Record<string, unknown>,
    })),
  };
}
