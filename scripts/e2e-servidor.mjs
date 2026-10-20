/**
 * Servidor do e2e (comando do `webServer` do Playwright). Só roda em testes de navegador, contra o
 * Supabase LOCAL; nunca em produção/Vercel (que não usam este arquivo).
 *
 * Por que existe: o Playwright sobe o `webServer` ANTES do `globalSetup`, e o Next embute
 * `NEXT_PUBLIC_SUPABASE_URL`/chave anon no bundle no BUILD. Com um `.next` antigo (ou feito para
 * outra stack) o navegador gravaria numa API diferente da que o e2e verificou. Aqui, em ordem e
 * fail-closed (qualquer falha encerra com código 1 sem iniciar o app):
 *   1. ambiente local + prova de que API, chaves, banco e portas reais do Docker são da MESMA stack
 *      (scripts/lib/stack-supabase-local.mjs);
 *   2. apaga `.next` (nenhum build anterior é reaproveitado);
 *   3. `next build` com o ambiente VERIFICADO passado explicitamente (variáveis do processo vencem
 *      qualquer arquivo .env* que o Next leria);
 *   4. grava o marcador `.next/identidade-e2e.json` (stack verificada + BUILD_ID gerado);
 *   5. aplica a trava de `pnpm start` e inicia `next start`.
 * O `globalSetup` (e2e/global-setup.ts) ainda prova, no servidor em execução, que o bundle servido
 * contém a API verificada, antes de criar qualquer dado.
 *
 * Sem shell: o Node e o `next` são executados diretamente. Nunca imprime valores de variáveis.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { ARQUIVO_MARCADOR, montarMarcador } from "./lib/bundle-servido.mjs";
import { ambienteEfetivo, verificarAmbienteLocal } from "./lib/guard-supabase-local.mjs";
import { exigirStackLocal } from "./lib/stack-supabase-local.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function recusar(motivo) {
  console.error(`\n✖ e2e: servidor recusado (trava fail-closed): ${motivo}\n  Nada foi construído nem iniciado.\n`);
  process.exit(1);
}

const argPorta = process.argv.indexOf("--port");
const porta = argPorta >= 0 ? process.argv[argPorta + 1] : undefined;
if (!porta || !/^\d{2,5}$/.test(porta)) recusar("informe --port <número>.");

let verificado;
const efetivo = ambienteEfetivo(loadEnv("development", raiz, ""), process.env);
try {
  verificarAmbienteLocal(efetivo);
  verificado = exigirStackLocal({ env: efetivo, raiz });
} catch (erro) {
  recusar(erro instanceof Error ? erro.message : String(erro));
}

// Ambiente verificado, passado explicitamente ao build e ao servidor.
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: efetivo.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: efetivo.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: efetivo.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: verificado.urlBanco,
};

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

rmSync(join(raiz, ".next"), { recursive: true, force: true });
const build = spawnSync(process.execPath, [nextBin, "build"], { cwd: raiz, env, stdio: "inherit", shell: false });
if (build.status !== 0) recusar("o build do app de teste falhou.");

try {
  const buildId = readFileSync(join(raiz, ".next", "BUILD_ID"), "utf8").trim();
  mkdirSync(dirname(join(raiz, ARQUIVO_MARCADOR)), { recursive: true });
  writeFileSync(
    join(raiz, ARQUIVO_MARCADOR),
    JSON.stringify(
      montarMarcador({
        apiUrl: verificado.apiUrl,
        anonKey: /** @type {string} */ (efetivo.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        buildId,
      }),
    ),
  );
} catch {
  recusar("não foi possível gravar o marcador de identidade do build.");
}

// Mesma trava do `pnpm start` (package.json), agora sobre o ambiente já verificado.
const trava = spawnSync(process.execPath, [join(raiz, "scripts", "checar-ambiente-local.mjs"), "start"], {
  cwd: raiz,
  env,
  stdio: "inherit",
  shell: false,
});
if (trava.status !== 0) recusar("a trava de `pnpm start` recusou o ambiente.");

const servidor = spawn(process.execPath, [nextBin, "start", "--port", porta], { cwd: raiz, env, stdio: "inherit", shell: false });
for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sinal, () => servidor.kill(sinal));
}
servidor.on("exit", (codigo, sinal) => process.exit(sinal ? 1 : (codigo ?? 1)));
