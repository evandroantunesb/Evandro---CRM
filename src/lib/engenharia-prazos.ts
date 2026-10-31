import "server-only";
import {
  ehChavePrazo,
  lerIndicadores,
  porUrgencia,
  type ChavePrazo,
  type IndicadoresEngenharia,
  type PeriodoIndicadores,
  type PrazoObra,
} from "@/lib/engenharia-prazos-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/tarefas-setor-regras";

/** Prazos em curso por obra, o mais urgente primeiro. A RLS das tabelas de origem decide o que cada um recebe. */
export async function carregarPrazosObras(supabase: SupabaseServidor, empresaId: string): Promise<Map<string, PrazoObra[]>> {
  const { data } = await supabase.rpc("prazos_engenharia", { p_empresa_id: empresaId });
  const mapa = new Map<string, PrazoObra[]>();
  for (const p of data ?? []) {
    if (!ehChavePrazo(p.chave)) continue;
    const lista = mapa.get(p.obra_id) ?? [];
    lista.push({ chave: p.chave, limite: p.limite, diasRestantes: p.dias_restantes });
    mapa.set(p.obra_id, lista);
  }
  for (const lista of mapa.values()) lista.sort(porUrgencia);
  return mapa;
}

/** Indicadores dos últimos N dias corridos, hoje incluído (horário de Brasília). Null se o banco recusar. */
export async function carregarIndicadoresEngenharia(
  supabase: SupabaseServidor,
  empresaId: string,
  periodo: PeriodoIndicadores,
): Promise<IndicadoresEngenharia | null> {
  const inicio = new Date(`${hojeBrasilia()}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (periodo - 1));
  const desde = inicio.toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("indicadores_engenharia", { p_empresa_id: empresaId, p_desde: desde });
  return error ? null : lerIndicadores(data);
}

export type ConfigPrazo = { chave: ChavePrazo; diasUteis: number | null };

export async function carregarConfigPrazos(supabase: SupabaseServidor, empresaId: string): Promise<ConfigPrazo[]> {
  const { data } = await supabase.from("engenharia_prazos").select("chave, dias_uteis").eq("empresa_id", empresaId);
  return (data ?? []).flatMap((p) => (ehChavePrazo(p.chave) ? [{ chave: p.chave, diasUteis: p.dias_uteis }] : []));
}

export async function carregarFeriadosEmpresa(supabase: SupabaseServidor, empresaId: string) {
  const { data } = await supabase.from("empresa_feriados").select("id, data, nome").eq("empresa_id", empresaId).order("data");
  return data ?? [];
}
