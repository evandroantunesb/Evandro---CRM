import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PropostaParada = {
  id: string;
  numero: number;
  titulo: string;
  contatoNome: string;
  responsavelId: string | null;
  ultimaAtividadeEm: string;
};

/**
 * Negócios abertos com proposta gerada, sem atividade recente: nem mudaram de etapa nem o
 * cliente abriu o link de novo nos últimos `diasLimite` dias. "Atividade" é o mais recente
 * entre `etapa_desde` (já mantido por gatilho) e a última abertura registrada — ou a data em
 * que a proposta foi gerada, se o cliente nunca abriu.
 */
export async function carregarPropostasParadas(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  opcoes: { responsavelId?: string; diasLimite?: number } = {},
): Promise<PropostaParada[]> {
  const diasLimite = opcoes.diasLimite ?? 7;
  const limite = new Date(Date.now() - diasLimite * 86_400_000);

  let consulta = supabase
    .from("negocios")
    .select("id, numero, titulo, etapa_desde, responsavel_id, contatos(nome), propostas!inner(id, created_at)")
    .eq("empresa_id", empresaId)
    .eq("status", "aberto");
  if (opcoes.responsavelId) consulta = consulta.eq("responsavel_id", opcoes.responsavelId);
  const { data: negocios } = await consulta.limit(2000);
  if (!negocios?.length) return [];

  const propostaPorNegocio = new Map<string, { id: string; created_at: string }>();
  for (const n of negocios) {
    const proposta = n.propostas as unknown as { id: string; created_at: string };
    propostaPorNegocio.set(n.id, proposta);
  }

  const { data: aberturas } = await supabase
    .from("propostas_aberturas")
    .select("proposta_id, aberta_em")
    .in(
      "proposta_id",
      [...propostaPorNegocio.values()].map((p) => p.id),
    )
    .order("aberta_em", { ascending: false });

  const ultimaAberturaPorProposta = new Map<string, string>();
  for (const a of aberturas ?? []) {
    if (!ultimaAberturaPorProposta.has(a.proposta_id)) ultimaAberturaPorProposta.set(a.proposta_id, a.aberta_em);
  }

  return negocios
    .map((n) => {
      const contato = n.contatos as unknown as { nome: string } | null;
      const proposta = propostaPorNegocio.get(n.id)!;
      const ultimaAbertura = ultimaAberturaPorProposta.get(proposta.id);
      const baseProposta = ultimaAbertura ?? proposta.created_at;
      const ultimaAtividadeEm = baseProposta > n.etapa_desde ? baseProposta : n.etapa_desde;
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
