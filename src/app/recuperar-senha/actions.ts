"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function pedirRecuperacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, mensagem: "E-mail inválido." };

  const supabase = await criarClienteServidor();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env.siteUrl}/auth/confirmar?next=/definir-senha`,
  });
  // Mesma resposta exista ou não a conta, para não revelar quem está cadastrado.
  return { ok: true, mensagem: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." };
}
