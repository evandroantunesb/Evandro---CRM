import "server-only";
import { carregarVigencia } from "@/lib/calculo-vigencia";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { economiaDoModelo, situacaoDaEconomia, type SituacaoEconomia } from "./economia-emissao";

/**
 * Situação da economia para a emissão (a tela e a ação usam a mesma): blocos do modelo padrão + cálculo do kit e a
 * vigência dele, com o cliente do usuário (RLS). Falha de leitura nunca vale como vigente.
 */
export async function carregarSituacaoEconomia(
  supabase: SupabaseServidor,
  negocioId: string,
  blocosDoModelo: { tipo: string; ativo: boolean; config: unknown }[] | null | undefined,
): Promise<SituacaoEconomia> {
  const modelo = economiaDoModelo(blocosDoModelo);
  if (!modelo.algum) return situacaoDaEconomia(modelo, null, false);
  const carregamento = await carregarVigencia(supabase, negocioId);
  const calculo = carregamento.ok ? carregamento.calculo : null;
  const vigente = carregamento.ok && carregamento.calculo != null && carregamento.vigencia.vigente;
  return situacaoDaEconomia(modelo, calculo, vigente);
}
