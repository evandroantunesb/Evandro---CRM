import { hojeIso } from "@/lib/estimativa-financeira";
import type { Database } from "@/lib/supabase/database.types";
import { COLUNAS_TARIFA_GD, tarifaGdDaLinha, type ContextoEstimativa } from "@/lib/tarifa-gd";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Dados do negócio que entram no contexto regulatório (qualificação SDR). */
export type NegocioParaEstimativa = { tipoCliente: string | null; distribuidoraInformada: string | null };

/**
 * Contexto regulatório do cálculo: data de hoje em São Paulo, qualificação do negócio e as linhas oficiais de
 * `tarifas_gd_aneel` (tabela pequena e só de leitura). Falha de leitura = `null` (estimativa incompleta, nunca um valor
 * presumido). Funciona com o cliente do usuário (RLS) ou com o admin.
 */
export async function carregarContextoEstimativa(
  supabase: SupabaseClient<Database>,
  negocio: NegocioParaEstimativa,
  dataReferencia: string = hojeIso(),
): Promise<ContextoEstimativa | null> {
  const { data, error } = await supabase.from("tarifas_gd_aneel").select(COLUNAS_TARIFA_GD);
  if (error || !data) return null;
  return {
    dataReferencia,
    tipoCliente: negocio.tipoCliente,
    distribuidoraInformada: negocio.distribuidoraInformada,
    tarifas: data.map(tarifaGdDaLinha),
  };
}
