/**
 * Cria (ou promove) o dono da plataforma.
 * Uso: pnpm super-admin <email> <senha> "<nome>"
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local (precisa ser o Supabase LOCAL:
 * recusa qualquer outro host antes de conectar).
 */
import { createClient } from "@supabase/supabase-js";
import { carregarAmbiente, exigirAmbienteLocal } from "./lib/ambiente-local.mjs";

// Mesmo objeto para validar e para conectar: arquivos .env* do modo "development" (precedência do
// Vite) com as variáveis do processo prevalecendo.
const env = carregarAmbiente("super-admin");
// Trava fail-closed: antes de qualquer conexão ou escrita, só aceita Supabase local (sem override).
exigirAmbienteLocal(env, "pnpm super-admin");
const [email, senha, nome = ""] = process.argv.slice(2);
if (!email || !senha) {
  console.error('Uso: pnpm super-admin <email> <senha> "<nome>"');
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: perfil } = await admin.from("perfis").select("id").eq("email", email.toLowerCase()).maybeSingle();
let userId = perfil?.id as string | undefined;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  userId = data.user.id;
}

const { error } = await admin.from("plataforma_admins").upsert({ user_id: userId });
if (error) throw error;
console.log(`${email} agora é super-admin.`);
