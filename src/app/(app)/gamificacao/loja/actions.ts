"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function resgatarRecompensa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("recompensaId"));
  if (!id.success) return { ok: false, mensagem: "Recompensa inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("solicitar_resgate", { p_recompensa_id: id.data });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível resgatar.") };

  revalidatePath("/gamificacao/loja");
  return { ok: true, mensagem: "Resgate solicitado!" };
}
