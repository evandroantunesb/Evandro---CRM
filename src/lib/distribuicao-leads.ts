import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
