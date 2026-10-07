"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/painel";

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
