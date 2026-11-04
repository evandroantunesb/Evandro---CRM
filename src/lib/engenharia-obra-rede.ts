import "server-only";
import { avisarSchemaAusente, tabelaAusente } from "@/lib/schema-ausente";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Obra de rede com custo (20261116100000_engenharia_obra_rede.sql): com orçamento da distribuidora, a Engenharia
 * registra documentação enviada ao cliente, pagamento à Copel (com o prazo da obra em dias úteis) e a obra concluída;
 * a vistoria só é pedida depois dela. A RLS é a mesma dos protocolos.
 */
export type ObraRedeVM = {
  documentosEnviadosEm: string | null;
  pagamentoEm: string | null;
  prazoDias: number | null;
  concluidaEm: string | null;
};

export async function carregarObraRede(supabase: SupabaseServidor, { empresaId, obraId }: { empresaId: string; obraId: string }): Promise<ObraRedeVM | null> {
  const { data, error } = await supabase
    .from("obra_engenharia_obra_rede")
    .select("documentos_enviados_em, pagamento_em, prazo_dias, concluida_em")
    .eq("empresa_id", empresaId)
    .eq("obra_id", obraId)
    .maybeSingle();
  // Preview antes da migration (usa o banco de produção): sem a tabela, o passo 7 segue como antes.
  if (tabelaAusente(error, "obra_engenharia_obra_rede")) {
    avisarSchemaAusente("obra_engenharia_obra_rede", error);
    return null;
  }
  if (error) throw error;
  if (!data) return null;
  return {
    documentosEnviadosEm: data.documentos_enviados_em,
    pagamentoEm: data.pagamento_em,
    prazoDias: data.prazo_dias,
    concluidaEm: data.concluida_em,
  };
}
