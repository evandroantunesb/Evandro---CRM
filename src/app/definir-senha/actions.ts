"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome"),
    senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem" });

export async function definirSenha(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return { ok: false, mensagem: "Não foi possível salvar a senha. Tente de novo." };

  await supabase.from("perfis").update({ nome: dados.data.nome }).eq("id", user.id);
  redirect("/inicio");
}
