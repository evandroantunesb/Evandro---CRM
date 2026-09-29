import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const HORAS_SEM_CONTATO_PADRAO = 3;

export type LeadSemContato = {
  id: string;
  numero: number;
  titulo: string;
  contatoNome: string;
  responsavelId: string | null;
  ultimaAtividadeEm: string;
};

/** Negócios abertos ainda na etapa inicial do funil, sem nenhuma nota registrada, criados há mais de X horas. */
export async function carregarLeadsSemContato(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  opcoes: { responsavelId?: string; horasLimite?: number } = {},
): Promise<LeadSemContato[]> {
  const horasLimite = opcoes.horasLimite ?? HORAS_SEM_CONTATO_PADRAO;
  const limite = new Date(Date.now() - horasLimite * 3_600_000);

  const { data: etapasIniciais } = await supabase.from("etapas").select("id").eq("empresa_id", empresaId).eq("inicial", true);
  const idsEtapasIniciais = (etapasIniciais ?? []).map((e) => e.id);
  if (!idsEtapasIniciais.length) return [];

  let consulta = supabase
    .from("negocios")
    .select("id, numero, titulo, created_at, responsavel_id, contatos(nome)")
    .eq("empresa_id", empresaId)
    .eq("status", "aberto")
    .in("etapa_id", idsEtapasIniciais);
  if (opcoes.responsavelId) consulta = consulta.eq("responsavel_id", opcoes.responsavelId);
  const { data: negocios } = await consulta.limit(2000);
  if (!negocios?.length) return [];

  const { data: notas } = await supabase
    .from("notas")
    .select("negocio_id")
    .in(
      "negocio_id",
      negocios.map((n) => n.id),
    );
  const idsComNota = new Set((notas ?? []).map((n) => n.negocio_id));

  return negocios
    .filter((n) => !idsComNota.has(n.id))
    .map((n) => {
      const contato = n.contatos as unknown as { nome: string } | null;
      return {
        id: n.id,
        numero: n.numero,
        titulo: n.titulo,
        contatoNome: contato?.nome ?? "(sem nome)",
        responsavelId: n.responsavel_id,
        ultimaAtividadeEm: n.created_at,
      };
    })
    .filter((n) => new Date(n.ultimaAtividadeEm) < limite)
    .sort((a, b) => new Date(a.ultimaAtividadeEm).getTime() - new Date(b.ultimaAtividadeEm).getTime());
}
