import "server-only";
import { linhaDeCalculo, problemaDaEntrada, type LinhaCalculo, type ResultadoLinha } from "@/lib/calculo-reproduzivel";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TipoLigacao } from "@/lib/tipos";

export type { LinhaCalculo };

/**
 * Monta a linha de `calculos_solares` a partir do kit (personalizado, por
 * componentes) e dos parâmetros da empresa. Compartilhado entre "salvar kit
 * e cálculo" (negócio já existe) e a criação de negócio com calculadora
 * embutida (nova proposta).
 */
export async function montarLinhaCalculo(
  supabase: SupabaseServidor,
  empresaId: string,
  entrada: {
    kitNome: string;
    potenciaKwp: number;
    precoKit: number;
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
  },
): Promise<ResultadoLinha> {
  // Entrada inválida responde antes de consultar os parâmetros (como antes).
  const problema = problemaDaEntrada(entrada);
  if (problema) return { ok: false, mensagem: problema };

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  // O consumo usado no cálculo é o mesmo que será gravado (2 casas): ver `consumoComoPersistido`.
  return linhaDeCalculo(empresaId, entrada, parametros);
}
