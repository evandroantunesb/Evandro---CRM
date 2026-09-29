import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const DIAS_PARADO_PADRAO = 7;

export type LeadParado = {
  id: string;
  numero: number;
  titulo: string;
  contatoNome: string;
  responsavelId: string | null;
  ultimaAtividadeEm: string;
};

/**
 * Negócios abertos sem atividade recente: nem mudaram de etapa nem ganharam uma nota
 * nova nos últimos `diasLimite` dias. "Atividade" é o mais recente entre `etapa_desde`
 * (já mantido por gatilho) e a nota mais nova do negócio.
 */
export async function carregarLeadsParados(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  opcoes: { responsavelId?: string; diasLimite?: number } = {},
): Promise<LeadParado[]> {
  const diasLimite = opcoes.diasLimite ?? DIAS_PARADO_PADRAO;
  const limite = new Date(Date.now() - diasLimite * 86_400_000);

  let consulta = supabase
    .from("negocios")
    .select("id, numero, titulo, etapa_desde, responsavel_id, contatos(nome)")
    .eq("empresa_id", empresaId)
    .eq("status", "aberto");
  if (opcoes.responsavelId) consulta = consulta.eq("responsavel_id", opcoes.responsavelId);
  const { data: negocios } = await consulta.limit(2000);
  if (!negocios?.length) return [];

  const { data: notas } = await supabase
    .from("notas")
    .select("negocio_id, created_at")
    .in(
      "negocio_id",
      negocios.map((n) => n.id),
    )
    .order("created_at", { ascending: false });

  const ultimaNotaPorNegocio = new Map<string, string>();
  for (const n of notas ?? []) {
    if (!ultimaNotaPorNegocio.has(n.negocio_id)) ultimaNotaPorNegocio.set(n.negocio_id, n.created_at);
  }

  return negocios
    .map((n) => {
      const contato = n.contatos as unknown as { nome: string } | null;
      const ultimaNota = ultimaNotaPorNegocio.get(n.id);
      const ultimaAtividadeEm = ultimaNota && ultimaNota > n.etapa_desde ? ultimaNota : n.etapa_desde;
      return {
        id: n.id,
        numero: n.numero,
        titulo: n.titulo,
        contatoNome: contato?.nome ?? "(sem nome)",
        responsavelId: n.responsavel_id,
        ultimaAtividadeEm,
      };
    })
    .filter((n) => new Date(n.ultimaAtividadeEm) < limite)
    .sort((a, b) => new Date(a.ultimaAtividadeEm).getTime() - new Date(b.ultimaAtividadeEm).getTime());
}
