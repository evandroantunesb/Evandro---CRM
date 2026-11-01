import "server-only";
import { CHAVES_PERGUNTA, respostaValida, type EnquadramentoVM, type RespostasEnquadramento } from "@/lib/engenharia-enquadramento-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

/** Ficha de enquadramento da obra; null se ainda não foi preenchida. A RLS decide: vem para quem vê a obra. */
export async function carregarEnquadramento(
  supabase: SupabaseServidor,
  { empresaId, obraId }: { empresaId: string; obraId: string },
): Promise<EnquadramentoVM | null> {
  const [{ data, error }, { data: identidades }] = await Promise.all([
    supabase.from("obra_engenharia_enquadramento").select("*").eq("empresa_id", empresaId).eq("obra_id", obraId).maybeSingle(),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  if (error) throw error;
  if (!data) return null;
  const respostas: RespostasEnquadramento = {};
  for (const chave of CHAVES_PERGUNTA) {
    const v = data[chave];
    if (typeof v === "string" && respostaValida(chave, v)) respostas[chave] = v;
  }
  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));
  return {
    respostas,
    justificativaAmbiental: data.justificativa_ambiental,
    potenciaModulosKwp: data.potencia_modulos_kwp,
    potenciaInversoresKw: data.potencia_inversores_kw,
    atualizadoEm: data.atualizado_em,
    atualizadoPor: data.atualizado_por ? (nomes.get(data.atualizado_por) ?? null) : null,
  };
}
