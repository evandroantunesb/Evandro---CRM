/**
 * Trava fail-closed de ambiente: comandos locais de desenvolvimento e administração (pnpm dev,
 * pnpm start, pnpm super-admin) só rodam com Supabase local. Reaproveita a verificação pura dos
 * testes (tests/guard-supabase-local.ts) e a aplica ao ambiente que o PRÓPRIO comando enxergaria:
 * cada ferramenta tem sua precedência de arquivos .env*, então usamos o carregador real de cada
 * uma (variáveis do processo sempre prevalecem). Não há override: execução remota é um fluxo
 * separado e autorizado (ver AGENTS.md).
 *
 * Nunca imprime valores de variáveis: as mensagens citam só o nome da variável e o host.
 */
import { createRequire } from "node:module";
import { loadEnv } from "vite";
import { verificarAmbienteLocal } from "../../tests/guard-supabase-local.ts";

export const MODOS = ["dev", "start", "super-admin"];

/** Ambiente efetivo do comando, como a ferramenta que ele executa o resolve. */
export function carregarAmbiente(modo, cwd = process.cwd()) {
  if (modo === "super-admin") {
    // Mesma chamada de scripts/criar-super-admin.mts: arquivos do modo "development" + processo.
    return { ...loadEnv("development", cwd, ""), ...process.env };
  }
  // next dev / next start: carregador do próprio Next (precedência dele; dev e start diferem).
  const require = createRequire(import.meta.url);
  const nextEnv = require(require.resolve("@next/env", { paths: [require.resolve("next/package.json")] }));
  nextEnv.loadEnvConfig(cwd, modo === "dev", { info() {}, error() {} }, true);
  return { ...process.env };
}

/** Encerra o processo (código 1) se o ambiente puder alcançar um Supabase não local. */
export function exigirAmbienteLocal(env, comando) {
  try {
    verificarAmbienteLocal(env);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(
      `\n✖ ${comando} recusado (trava fail-closed): ${motivo}\n` +
        "  Este comando só roda com o Supabase local (`pnpm exec supabase start`) e um .env.local local.\n" +
        "  Não há override. Execução remota exige um fluxo separado e autorizado (ver AGENTS.md).\n",
    );
    process.exit(1);
  }
}
