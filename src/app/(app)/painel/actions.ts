"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/painel";

const esquema = z.object({
  id: z.string().uuid(),
  membro_final_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/** Aprova (sem membro_final_id) ou reatribui (com membro_final_id) um lead pendente. */
export async function decidirAtribuicaoLead(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin", "gestor");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("aprovar_atribuicao_lead", {
    p_id: dados.data.id,
    p_membro_final_id: dados.data.membro_final_id,
  });
  if (error) return { ok: false, mensagem: "Não foi possível decidir esta atribuição. Ela pode já ter sido decidida." };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: dados.data.membro_final_id ? "Lead reatribuído." : "Lead aprovado." };
}

const esquemaReatribuir = z.object({
  negocioId: z.string().uuid(),
  responsavelId: z.string().uuid(),
});

/** Troca o responsável de um negócio direto do Painel (leads/propostas parados), sem abrir o negócio. */
export async function reatribuirResponsavel(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin", "gestor");
  const dados = esquemaReatribuir.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({ responsavel_id: dados.data.responsavelId })
    .eq("id", dados.data.negocioId)
    .eq("empresa_id", atual.empresaId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível reatribuir este negócio." };

  revalidatePath(CAMINHO);
  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Negócio reatribuído." };
}
