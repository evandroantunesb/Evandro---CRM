import { inject } from "vitest";
import { Client } from "pg";

/**
 * ÚNICA fonte da conexão direta com o Postgres nas suítes. A URL vem de tests/global-setup.ts, que
 * só a entrega depois de comprovar que o banco é o da mesma stack da API (e que nenhuma escrita
 * ocorreu antes). Suítes nunca leem `SUPABASE_DB_URL` nem usam portas fixas: tests/banco-local-uso.test.ts
 * falha se alguma o fizer.
 */
export function urlBancoLocal(): string {
  const url = inject("urlBancoVerificada");
  if (!url) throw new Error("Banco não verificado: tests/global-setup.ts não entregou a URL. Teste recusado.");
  return url;
}

/** Cliente `pg` já apontado para o banco verificado (o chamador conecta e encerra). */
export function novoClienteBanco(): Client {
  return new Client({ connectionString: urlBancoLocal() });
}
