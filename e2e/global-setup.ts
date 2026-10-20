import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FullConfig } from "@playwright/test";
import { loadEnv } from "vite";
import { exigirBundleServido } from "../scripts/lib/bundle-servido.mjs";
import { ambienteEfetivo, verificarAmbienteLocal } from "../scripts/lib/guard-supabase-local.mjs";
import { exigirStackLocal } from "../scripts/lib/stack-supabase-local.mjs";
import { criarBaseFicticia } from "./base-ficticia";
import { ARQUIVO_BASE } from "./ajuda";

/**
 * O app de teste já está de pé (o Playwright sobe o `webServer` antes do `globalSetup`, e quem o
 * sobe é scripts/e2e-servidor.mjs, que verifica a stack e reconstrói o app). Aqui, antes de criar
 * QUALQUER dado, em ordem e fail-closed:
 * 1. a MESMA trava de ambiente local do Vitest e do `pnpm start` (scripts/lib/guard-supabase-local.mjs);
 * 2. prova de que API, chaves, Postgres e portas reais do Docker são da MESMA stack local, e entrega
 *    ao e2e a URL de banco verificada em `SUPABASE_DB_URL` (sem padrão de porta fixa);
 * 3. prova de que o bundle que o servidor ENTREGA ao navegador foi construído para essa stack
 *    (scripts/lib/bundle-servido.mjs): um build antigo ou de outra stack é recusado.
 * Só então cria a base fictícia e grava ids/e-mails (nunca chaves) para os testes.
 */
export default async function setup(config: Pick<FullConfig, "projects">) {
  const raiz = process.cwd();
  const efetivo = ambienteEfetivo(loadEnv("development", raiz, ""), process.env);
  verificarAmbienteLocal(efetivo);
  const { urlBanco, apiUrl } = exigirStackLocal({ env: efetivo, raiz });

  const baseUrl = config.projects[0]?.use?.baseURL;
  if (!baseUrl) throw new Error("e2e: baseURL ausente na configuração do Playwright: não é possível provar o bundle servido.");
  await exigirBundleServido({
    raiz,
    baseUrl,
    apiUrl,
    anonKey: efetivo.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  });

  process.env.SUPABASE_DB_URL = urlBanco;
  // Os scripts da base leem process.env: só os valores já validados como locais.
  for (const chave of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (efetivo[chave] && !process.env[chave]) process.env[chave] = efetivo[chave];
  }

  const base = await criarBaseFicticia();
  mkdirSync(dirname(ARQUIVO_BASE), { recursive: true });
  writeFileSync(ARQUIVO_BASE, JSON.stringify(base, null, 2));
}
