import "server-only";
import type { PlanejamentoObra } from "./tipos";

/**
 * DEMONSTRAÇÃO LOCAL da Apresentação (dados FICTÍCIOS). O banco ainda não tem avanço físico;
 * este dado existe só para avaliar a interface. Cronograma, custos e lucro são sempre os reais.
 *
 * Liga apenas com as DUAS condições, checadas no servidor a cada requisição:
 *   1. RAION_DEMO_APRESENTACAO=1 (variável de servidor; não é NEXT_PUBLIC);
 *   2. o Supabase em uso é local (127.0.0.1 / localhost / ::1).
 * Em produção o Supabase é remoto: a demonstração nunca liga, mesmo com a variável definida.
 * Os dados casam pelo nome do cliente das obras da base fictícia (e2e/base-ficticia.ts); nada
 * é gravado no banco. Toda tela que usar estes dados mostra o selo "Dados fictícios".
 */

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function demonstracaoAtiva(env: Record<string, string | undefined> = process.env): boolean {
  if (env.RAION_DEMO_APRESENTACAO !== "1") return false;
  try {
    return HOSTS_LOCAIS.has(new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

/** Avanço físico fictício por cliente. */
function planejamentos(): Record<string, PlanejamentoObra> {
  return {
    "Usina Solar Fazenda Modelo (fictícia)": {
      avancoFisico: 68,
    },
    "Mercado Bom Preço (fictício)": {
      avancoFisico: 41,
    },
    "Clínica Vida (fictícia)": {
      avancoFisico: 92,
    },
  };
}

/** Planejamento fictício da obra, só com a demonstração ativa; null caso contrário. */
export function planejamentoDemonstracao(clienteNome: string, env: Record<string, string | undefined> = process.env): PlanejamentoObra | null {
  if (!demonstracaoAtiva(env)) return null;
  return planejamentos()[clienteNome] ?? null;
}
