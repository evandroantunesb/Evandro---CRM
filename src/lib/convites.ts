import "server-only";
import { env } from "@/lib/env";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Garante que existe uma conta para o e-mail e devolve o id.
 * Conta nova recebe o e-mail de convite; conta que já existe (ex.: a pessoa
 * trabalha em outra empresa do Raion) só é vinculada, sem novo e-mail.
 */
export async function garantirUsuario(email: string, nome: string): Promise<{ userId: string; novo: boolean }> {
  const admin = criarClienteAdmin();
  const emailNormalizado = email.trim().toLowerCase();

  const { data: existente } = await admin
    .from("perfis")
    .select("id, nome")
    .eq("email", emailNormalizado)
    .maybeSingle();
  if (existente) {
    // Conta criada sem nome (ex.: pelo painel do Supabase): aproveita o nome informado.
    if (!existente.nome?.trim() && nome.trim()) await admin.from("perfis").update({ nome: nome.trim() }).eq("id", existente.id);
    return { userId: existente.id, novo: false };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(emailNormalizado, {
    data: { nome },
    redirectTo: `${env.siteUrl}/auth/confirmar?next=/definir-senha`,
  });
  if (error || !data.user) {
    throw new Error(`Não foi possível enviar o convite: ${error?.message ?? "erro desconhecido"}`);
  }
  return { userId: data.user.id, novo: true };
}

/**
 * Cria a conta direto, com a senha temporária definida aqui, sem depender do
 * e-mail de convite (que precisa de um SMTP próprio configurado no Supabase
 * — sem isso o convite nunca chega, ver garantirUsuario acima). Conta que já
 * existe só é vinculada, mesmo comportamento de garantirUsuario.
 */
export async function criarUsuarioDireto(email: string, nome: string, senha: string): Promise<{ userId: string; novo: boolean }> {
  const admin = criarClienteAdmin();
  const emailNormalizado = email.trim().toLowerCase();

  const { data: existente } = await admin
    .from("perfis")
    .select("id, nome")
    .eq("email", emailNormalizado)
    .maybeSingle();
  if (existente) {
    if (!existente.nome?.trim() && nome.trim()) await admin.from("perfis").update({ nome: nome.trim() }).eq("id", existente.id);
    return { userId: existente.id, novo: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user) {
    throw new Error(`Não foi possível criar o usuário: ${error?.message ?? "erro desconhecido"}`);
  }
  return { userId: data.user.id, novo: true };
}
