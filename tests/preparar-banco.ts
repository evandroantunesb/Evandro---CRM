import { ambienteEfetivo, verificarAmbienteLocal } from "./guard-supabase-local";
import { exigirStackLocal } from "../scripts/lib/stack-supabase-local.mjs";

// Variáveis de conexão que os workers leem; se processo e `test.env` divergirem em alguma, a
// precedência é ambígua (o Vitest sobrepõe o processo com `test.env`) e a execução é recusada.
const VARIAVEIS_CONEXAO = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
];

type Projeto = { config: { env?: Record<string, unknown>; root: string }; provide(chave: "urlBancoVerificada", valor: string): void };

/**
 * Trava global dos testes de integração (chamada por tests/global-setup.ts antes de qualquer suíte):
 * 1. ambiente fail-closed local; 2. prova de que API, chaves e Postgres são da MESMA stack (ver
 * scripts/lib/stack-supabase-local.mjs); 3. só então entrega a URL verificada às suítes. Se qualquer
 * passo falhar, nada é entregue e nenhuma suíte roda. O ambiente avaliado é o que os workers
 * enxergam: processo sobreposto por `test.env`.
 */
export function prepararBancoVerificado(
  projeto: Projeto,
  processo: Record<string, string | undefined> = process.env,
  executarStatus?: (raiz: string) => string,
) {
  try {
    const doConfig = (projeto.config.env ?? {}) as Record<string, string | undefined>;
    for (const nome of VARIAVEIS_CONEXAO) {
      if (processo[nome] !== undefined && doConfig[nome] !== undefined && processo[nome] !== doConfig[nome]) {
        throw new Error(`${nome} difere entre o processo e a configuração do Vitest: precedência ambígua.`);
      }
    }
    const efetivo = ambienteEfetivo(processo, doConfig);
    verificarAmbienteLocal(efetivo);
    const { urlBanco } = exigirStackLocal({ env: efetivo, raiz: projeto.config.root, executarStatus });
    projeto.provide("urlBancoVerificada", urlBanco);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `Testes abortados antes de rodar (trava fail-closed): ${motivo}\n` +
        "Use a stack Supabase local deste repositório (`pnpm exec supabase start`) e um .env.local com os valores de `supabase status`. Nada foi executado.",
    );
  }
}
