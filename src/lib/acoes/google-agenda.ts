"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/sessao";
import { GOOGLE_AGENDA } from "@/lib/permissoes";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function desconectarGoogleAgenda() {
  const { atual } = await exigirPapel(...GOOGLE_AGENDA);
  const admin = criarClienteAdmin();
  await admin.from("google_agenda_conexoes").delete().eq("membro_id", atual.membroId);
  revalidatePath("/perfil");
}
