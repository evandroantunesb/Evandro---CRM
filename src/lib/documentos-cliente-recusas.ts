import "server-only";
import { ehDocumentoCliente, type RecusaDocumento } from "@/lib/documentos-cliente";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Documentos do cliente do negócio que a Engenharia da obra recusou (`documentos_recusados_negocio`, P2c), para a aba
 * Proposta e contrato. O banco só devolve para quem vê o negócio; `nomeMembro` dá o nome de quem recusou.
 */
export async function carregarRecusasDocumentos(supabase: SupabaseServidor, negocioId: string, nomeMembro: (id: string) => string): Promise<RecusaDocumento[]> {
  const { data } = await supabase.rpc("documentos_recusados_negocio", { p_negocio_id: negocioId });
  return (data ?? []).flatMap((r): RecusaDocumento[] =>
    ehDocumentoCliente(r.documento)
      ? [{ documento: r.documento, anexoId: r.anexo_id, motivo: r.motivo, recusadoPor: r.recusado_por ? nomeMembro(r.recusado_por) : null, recusadoEm: r.recusado_em }]
      : [],
  );
}
