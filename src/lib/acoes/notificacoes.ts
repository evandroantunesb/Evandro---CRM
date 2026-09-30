"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Marca uma notificação do sininho como lida (RLS já restringe à própria: ver migration notificacoes). */
export async function marcarNotificacaoLida(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", id.data);
  revalidatePath("/", "layout");
}
