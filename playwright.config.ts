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
    command: `pnpm start --port ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
