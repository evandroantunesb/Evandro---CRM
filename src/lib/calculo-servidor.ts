import "server-only";
import { linhaDeCalculo, problemaDaEntrada, type EntradaLinhaCalculo, type LinhaCalculo, type ResultadoLinha } from "@/lib/calculo-reproduzivel";
import { carregarContextoEstimativa, type NegocioParaEstimativa } from "@/lib/contexto-estimativa";
import type { SupabaseServidor } from "@/lib/supabase/server";

export type { LinhaCalculo, NegocioParaEstimativa };

/**
 * Monta a linha de `calculos_solares` a partir do kit (personalizado, por componentes), dos parâmetros da empresa e
 * do contexto regulatório do negócio. Compartilhado entre "salvar kit e cálculo" (negócio já existe) e a criação de
 * negócio com calculadora embutida (nova proposta, ainda sem qualificação: estimativa incompleta).
 */
export async function montarLinhaCalculo(
  supabase: SupabaseServidor,
  empresaId: string,
  entrada: EntradaLinhaCalculo,
  negocio: NegocioParaEstimativa,
): Promise<ResultadoLinha> {
  // Entrada inválida responde antes de consultar os parâmetros (como antes).
  const problema = problemaDaEntrada(entrada);
  if (problema) return { ok: false, mensagem: problema };

  const [{ data: parametros }, contexto] = await Promise.all([
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", empresaId).maybeSingle(),
    carregarContextoEstimativa(supabase, negocio),
  ]);

  // O consumo usado no cálculo é o mesmo que será gravado (2 casas): ver `consumoComoPersistido`.
  return linhaDeCalculo(empresaId, entrada, parametros, contexto);
}
