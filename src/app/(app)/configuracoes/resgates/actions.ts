"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { STATUS_RESGATE, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/resgates";

export async function mudarStatusResgate(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const novoStatus = z.enum(STATUS_RESGATE).safeParse(formData.get("novoStatus"));
  if (!id.success || !novoStatus.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("atualizar_status_resgate", {
    p_resgate_id: id.data,
    p_novo_status: novoStatus.data,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o resgate.") };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Atualizado." };
}
