import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnv } from "vite";
import { ambienteEfetivo, verificarAmbienteLocal } from "../scripts/lib/guard-supabase-local.mjs";
import { exigirStackLocal } from "../scripts/lib/stack-supabase-local.mjs";
import { criarBaseFicticia } from "./base-ficticia";
import { ARQUIVO_BASE } from "./ajuda";

/**
 * Antes de tudo: a MESMA trava fail-closed do Vitest e do `pnpm start` (fonte única em
 * scripts/lib/guard-supabase-local.mjs). Se qualquer destino não for local, aborta sem criar nada.
 * Em seguida comprova que API, chaves e Postgres são da MESMA stack local (como no Vitest) e só então
 * entrega ao e2e a URL de banco verificada em `SUPABASE_DB_URL` (sem padrão de porta fixa).
 * Depois cria a base fictícia e grava ids/e-mails (nunca chaves) para os testes.
 */
export default async function setup() {
  const efetivo = ambienteEfetivo(loadEnv("development", process.cwd(), ""), process.env);
  verificarAmbienteLocal(efetivo);
  const { urlBanco } = exigirStackLocal({ env: efetivo, raiz: process.cwd() });
  process.env.SUPABASE_DB_URL = urlBanco;
  // Os scripts da base leem process.env: só os valores já validados como locais.
  for (const chave of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (efetivo[chave] && !process.env[chave]) process.env[chave] = efetivo[chave];
  }

  const base = await criarBaseFicticia();
  mkdirSync(dirname(ARQUIVO_BASE), { recursive: true });
  writeFileSync(ARQUIVO_BASE, JSON.stringify(base, null, 2));
}
