import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembroResumo } from "@/lib/crm";
import type { Database } from "@/lib/supabase/database.types";
import type { ModoDistribuicaoLeads, Papel } from "@/lib/tipos";

type Cliente = SupabaseClient<Database>;

async function proximoPorRodizio(supabase: Cliente, empresaId: string, papeis: Papel[]) {
  const { data } = await supabase
    .from("empresa_membros")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .eq("recebe_leads", true)
    .in("papel", papeis)
    .order("recebeu_lead_em", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  return data;
}

async function sorteioEntre(supabase: Cliente, empresaId: string, papeis: Papel[]) {
  const { data } = await supabase
    .from("empresa_membros")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .eq("recebe_leads", true)
    .in("papel", papeis);
  if (!data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)];
}

/**
 * Escolhe o próximo responsável do rodízio de leads, respeitando o modo de distribuição da
 * empresa (Configurações > Origens, pedido do Evandro em 2026-09-30): "somente vendedores"
 * (padrão — SDR nunca entra), "somente SDR" (100%, cai pro pool de vendedor se não houver SDR
 * ativo), "parcial" (sorteia o pool pelo percentual configurado) ou "aleatório" (sorteia a
 * pessoa dentro do pool elegível, vendedor+SDR juntos, em vez do rodízio por tempo).
 */
export async function escolherProximoResponsavel(
  supabase: Cliente,
  empresaId: string,
  modo: ModoDistribuicaoLeads,
  percentualLeadsSdr: number,
): Promise<{ id: string } | null> {
  if (modo === "aleatorio") return sorteioEntre(supabase, empresaId, ["vendedor", "sdr"]);

  if (modo === "somente_sdr") {
    const sdr = await proximoPorRodizio(supabase, empresaId, ["sdr"]);
    return sdr ?? proximoPorRodizio(supabase, empresaId, ["vendedor"]);
  }

  if (modo === "parcial") {
    const irProSdr = Math.random() * 100 < percentualLeadsSdr;
    if (irProSdr) {
      const sdr = await proximoPorRodizio(supabase, empresaId, ["sdr"]);
      if (sdr) return sdr;
    }
    return proximoPorRodizio(supabase, empresaId, ["vendedor"]);
  }

  return proximoPorRodizio(supabase, empresaId, ["vendedor"]);
}

// Fila "Leads a distribuir" ---------------------------------------------------------------

export type AtribuicaoPendente = {
  id: string;
  negocioId: string;
  negocioNumero: number;
  contatoNome: string;
  membroSugeridoId: string;
  membroSugeridoNome: string;
  expiraEm: string;
};

/** Leads que o rodízio sugeriu e ainda esperam aprovação (ou reatribuição) do gestor. */
export async function carregarAtribuicoesPendentes(supabase: Cliente, empresaId: string): Promise<AtribuicaoPendente[]> {
  const { data } = await supabase
    .from("atribuicoes_leads")
    .select(
      "id, expira_em, negocios!inner(id, numero, contatos(nome)), empresa_membros!atribuicoes_leads_membro_sugerido_id_fkey(id, perfis(nome))",
    )
    .eq("empresa_id", empresaId)
    .eq("status", "pendente")
    .order("expira_em");

  return (data ?? []).map((a) => {
    const negocio = a.negocios as unknown as { id: string; numero: number; contatos: { nome: string } | null };
    const membro = a.empresa_membros as unknown as { id: string; perfis: { nome: string } | null };
    return {
      id: a.id,
      negocioId: negocio.id,
      negocioNumero: negocio.numero,
      contatoNome: negocio.contatos?.nome ?? "(sem nome)",
      membroSugeridoId: membro.id,
      membroSugeridoNome: membro.perfis?.nome ?? "(sem nome)",
      expiraEm: a.expira_em,
    };
  });
}

/** Quantos leads esperam distribuição (só admin/gestor enxergam a tabela — RLS). */
export async function contarAtribuicoesPendentes(supabase: Cliente, empresaId: string): Promise<number> {
  const { count } = await supabase
    .from("atribuicoes_leads")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("status", "pendente");
  return count ?? 0;
}

/** Papéis que o rodízio pode sugerir (ver escolherProximoResponsavel) — os mesmos oferecidos na fila. */
export const PAPEIS_CANDIDATOS_DISTRIBUICAO: readonly Papel[] = ["vendedor", "sdr"];

/** Quem pode receber um lead na fila: membros ativos com papel vendedor ou SDR. */
export function candidatosDistribuicao(membros: MembroResumo[]): MembroResumo[] {
  return membros.filter((m) => m.ativo && (PAPEIS_CANDIDATOS_DISTRIBUICAO as readonly string[]).includes(m.papel));
}

/**
 * Responsável pré-selecionado na fila: o sugerido pelo rodízio, se ainda for candidato.
 * Senão, vazio — o gestor precisa escolher alguém (nunca cai sozinho no primeiro da lista).
 */
export function responsavelPadrao(candidatos: MembroResumo[], membroSugeridoId: string): string {
  return candidatos.some((c) => c.id === membroSugeridoId) ? membroSugeridoId : "";
}
