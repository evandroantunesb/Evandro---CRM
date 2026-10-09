import { loadEnv } from "vite";
import { ambienteEfetivo, verificarAmbienteLocal } from "./guard-supabase-local";

/**
 * Roda uma vez antes de qualquer suíte. Replica o ambiente que o Vitest injeta
 * (`loadEnv` com variáveis do processo prevalecendo) e aborta se não for 100% local.
 */
export default function setup() {
  const efetivo = ambienteEfetivo(loadEnv("development", process.cwd(), ""), process.env);
  try {
    verificarAmbienteLocal(efetivo);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `Testes abortados antes de rodar (trava fail-closed): ${motivo}\n` +
        "Use Supabase local (`supabase start`) e um .env.local local. Nada foi executado.",
    );
  }
}
