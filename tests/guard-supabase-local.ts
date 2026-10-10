/**
 * Trava fail-closed dos testes. A implementação (fonte única, compartilhada com pnpm dev,
 * pnpm start e pnpm super-admin) fica em scripts/lib/guard-supabase-local.mjs; este arquivo só a
 * reexporta para manter os imports de tests/global-setup.ts e tests/guard-supabase-local.test.ts.
 */
export { ambienteEfetivo, verificarAmbienteLocal } from "../scripts/lib/guard-supabase-local.mjs";
