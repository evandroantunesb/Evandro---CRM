import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente com a service role: ignora o RLS.
 * Use somente depois de confirmar a permissão de quem chamou,
 * e só para o que o usuário não consegue fazer sozinho (ex.: enviar convites).
 */
export function criarClienteAdmin() {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
