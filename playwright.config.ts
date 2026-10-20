import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";
import { ambienteEfetivo, verificarAmbienteLocal } from "./scripts/lib/guard-supabase-local.mjs";

/**
 * Testes de navegador (OPR 3A) contra o app em `pnpm start` e o Supabase LOCAL. A trava
 * fail-closed roda aqui (antes de qualquer teste) e de novo no `pnpm start` do webServer.
 * Só no workflow "Navegador (Obras)", nunca contra produção.
 */
const efetivo = ambienteEfetivo(loadEnv("development", process.cwd(), ""), process.env);
verificarAmbienteLocal(efetivo);
for (const chave of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (efetivo[chave] && !process.env[chave]) process.env[chave] = efetivo[chave];
}

const PORTA = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // A base é única e os arquivos alteram dados em sequência: um worker, ordem dos arquivos.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    // No Actions, cada falha vira anotação no job (visível sem baixar artefatos).
    ...(process.env.CI ? ([["github"]] as const) : []),
    ["list"],
    ["html", { open: "never", outputFolder: "e2e-relatorio" }],
    ["json", { outputFile: "e2e-relatorio/resultados.json" }],
  ],
  outputDir: "e2e-resultados",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // scripts/e2e-servidor.mjs: verifica a stack, apaga .next, reconstrói com o ambiente verificado
    // e só então inicia o app (o bundle embute a URL da API no build). Por isso o timeout cobre o build.
    command: `node scripts/e2e-servidor.mjs --port ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    // Nunca reaproveita um servidor já de pé: a identidade dele não seria comprovada.
    reuseExistingServer: false,
    timeout: 900_000,
    // Demonstração da Apresentação (dados fictícios): só aqui, e o próprio app ainda exige
    // Supabase local para ligá-la (src/lib/obras/apresentacao/demo.ts).
    env: { RAION_DEMO_APRESENTACAO: "1" },
  },
});
