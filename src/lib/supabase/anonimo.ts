import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente anônimo no servidor (papel `anon`, sem sessão): para páginas públicas que leem só por funções liberadas para
 * `anon`, como `acompanhamento_obra`. O banco decide o que sai.
 */
export function criarClienteAnonimo() {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
