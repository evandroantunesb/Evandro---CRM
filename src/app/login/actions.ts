"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha"),
});

export async function entrar(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) {
    if (error.code === "invalid_credentials") return { ok: false, mensagem: "E-mail ou senha incorretos." };
    // Chave ou endereço do Supabase errados, serviço fora do ar etc.: aparece nos logs da Vercel.
    console.error("Falha ao entrar:", error.status, error.code, error.message);
    return { ok: false, mensagem: "Não foi possível conectar ao servidor. Tente de novo em instantes." };
  }

  redirect("/inicio");
}
