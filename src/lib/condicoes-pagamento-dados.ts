import "server-only";
import { MEIOS_PARCELAMENTO, preferenciasDaEmpresa } from "@/lib/condicoes-pagamento";
import type { RegrasCondicoes } from "@/lib/condicoes-pagamento-proposta";
import type { criarClienteServidor } from "@/lib/supabase/server";

/**
 * O que a empresa permite a quem está logado nas condições de pagamento da proposta deste negócio: Personalizado,
 * parcelas e taxas (PR 1), o limite de desconto de quem emite e o maior desconto já aprovado no negócio (PR 2). A ficha
 * mostra a partir daqui e a emissão confere de novo a partir daqui. Nulo = não foi possível ler.
 */
export async function carregarRegrasCondicoes(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  empresaId: string,
  negocioId: string,
): Promise<RegrasCondicoes | null> {
  const [preferenciasR, taxasR, limiteR, aprovadoR] = await Promise.all([
    supabase.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor, desconto_max_gestor, personalizado_ativo").eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("taxas_parcelamento").select("meio, parcelas, taxa_percentual").eq("empresa_id", empresaId).order("parcelas"),
    supabase.rpc("meu_limite_desconto", { p_empresa_id: empresaId }),
    supabase
      .from("descontos_solicitacoes")
      .select("percentual")
      .eq("negocio_id", negocioId)
      .eq("status", "aprovado")
      .order("percentual", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (preferenciasR.error || taxasR.error || limiteR.error || aprovadoR.error) return null;
  const taxas = Object.fromEntries(
    MEIOS_PARCELAMENTO.map((meio) => [
      meio,
      (taxasR.data ?? []).filter((t) => t.meio === meio).map((t) => ({ parcelas: t.parcelas, taxa: Number(t.taxa_percentual) })),
    ]),
  ) as RegrasCondicoes["taxas"];
  return {
    personalizadoAtivo: preferenciasDaEmpresa(preferenciasR.data).personalizadoAtivo,
    taxas,
    limiteDesconto: Number(limiteR.data ?? 0),
    descontoAprovado: Number(aprovadoR.data?.percentual ?? 0),
  };
}
