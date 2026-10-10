/**
 * Uso: node scripts/checar-ambiente-local.mjs <dev|start>
 * Executado antes do app (ver "dev" e "start" no package.json): sai com código 1, sem iniciar o
 * Next.js, se o ambiente efetivo apontar para Supabase não local.
 */
import { MODOS, carregarAmbiente, exigirAmbienteLocal } from "./lib/ambiente-local.mjs";

const modo = process.argv[2];
if (!MODOS.includes(modo)) {
  console.error(`Uso: node scripts/checar-ambiente-local.mjs <${MODOS.join("|")}>`);
  process.exit(2);
}
exigirAmbienteLocal(carregarAmbiente(modo), `pnpm ${modo}`);
console.log("✔ Ambiente local confirmado (Supabase em 127.0.0.1/localhost).");
