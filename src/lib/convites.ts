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
    .select("id")
    .eq("email", emailNormalizado)
    .maybeSingle();
  if (existente) return { userId: existente.id, novo: false };

  const { data, error } = await admin.auth.admin.inviteUserByEmail(emailNormalizado, {
    data: { nome },
    redirectTo: `${env.siteUrl}/auth/confirmar?next=/definir-senha`,
  });
  if (error || !data.user) {
    throw new Error(`Não foi possível enviar o convite: ${error?.message ?? "erro desconhecido"}`);
  }
  return { userId: data.user.id, novo: true };
}
