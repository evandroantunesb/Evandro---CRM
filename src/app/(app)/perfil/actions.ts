"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function salvarPerfil(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await obterSessao();
  const nome = z.string().trim().min(2, "Informe seu nome").max(80, "Nome muito longo").safeParse(formData.get("nome"));
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("perfis").update({ nome: nome.data }).eq("id", sessao.userId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Perfil salvo." };
}
