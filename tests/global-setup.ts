import type { TestProject } from "vitest/node";
import { prepararBancoVerificado } from "./preparar-banco";

declare module "vitest" {
  export interface ProvidedContext {
    /** URL de banco comprovada como a da MESMA stack da API (ver scripts/lib/stack-supabase-local.mjs). */
    urlBancoVerificada: string;
  }
}

/**
 * Roda uma vez antes de qualquer suíte, portanto antes de qualquer escrita. Toda a lógica está em
 * tests/preparar-banco.ts (testável sem Vitest rodando); as suítes recebem o banco por
 * `inject` (tests/banco-local.ts) e nunca o resolvem por conta própria.
 */
export default function setup(project: TestProject) {
  prepararBancoVerificado(project);
}
