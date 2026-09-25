import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SENHA = "senha-de-teste-123";

/** Cliente sem RLS, só para preparar o cenário e conferir o resultado. */
export const servico = createClient<Database>(URL, SERVICE, { auth: { persistSession: false } });

export const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export async function criarUsuario(nome: string) {
  const email = `${nome}-${sufixo}@teste.raion`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  const cliente = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
  const { error: erroLogin } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (erroLogin) throw erroLogin;
  return { id: data.user.id, email, cliente };
}

export type Usuario = Awaited<ReturnType<typeof criarUsuario>>;
