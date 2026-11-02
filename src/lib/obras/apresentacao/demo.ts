import "server-only";
import type { PlanejamentoObra } from "./tipos";

/**
 * DEMONSTRAÇÃO LOCAL da Apresentação (dados FICTÍCIOS). O banco ainda não tem avanço físico,
 * custos nem margem; estes dados existem só para avaliar a interface. O cronograma é sempre o real.
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

/**
 * Planejamento fictício por cliente. Números coerentes entre si:
 * Fazenda Modelo — orçado 130.000 (soma das categorias), realizado 92.000 (soma), projetado
 * 135.000 (≥ realizado), receita líquida 180.000 → margem 45.000 = 25%; planejada 27,8%
 * (180.000 − 130.000), logo −2,8 p.p.
 */
function planejamentos(): Record<string, PlanejamentoObra> {
  return {
    "Usina Solar Fazenda Modelo (fictícia)": {
      avancoFisico: 68,
      custos: [
        { categoria: "material_ca", orcado: 14_000, realizado: 16_000 },
        { categoria: "material_cc", orcado: 72_000, realizado: 52_000 },
        { categoria: "mao_de_obra", orcado: 22_000, realizado: 14_000 },
        { categoria: "equipamentos", orcado: 9_000, realizado: 6_000 },
        { categoria: "servicos", orcado: 8_000, realizado: 2_500 },
        { categoria: "logistica", orcado: 5_000, realizado: 1_500 },
      ],
      financeiro: { receitaLiquida: 180_000, custoOrcado: 130_000, custoRealizado: 92_000, custoFinalProjetado: 135_000, margemPlanejadaPct: (50_000 / 180_000) * 100 },
    },
    // Custo ainda dentro do orçado.
    "Mercado Bom Preço (fictício)": {
      avancoFisico: 41,
      custos: [
        { categoria: "material_ca", orcado: 3_500, realizado: 3_200 },
        { categoria: "material_cc", orcado: 21_000, realizado: 20_400 },
        { categoria: "mao_de_obra", orcado: 6_000, realizado: 0 },
        { categoria: "logistica", orcado: 1_500, realizado: 900 },
      ],
      financeiro: { receitaLiquida: 44_000, custoOrcado: 32_000, custoRealizado: 24_500, custoFinalProjetado: 31_800, margemPlanejadaPct: (12_000 / 44_000) * 100 },
    },
    // Quase concluída, sem desvio relevante.
    "Clínica Vida (fictícia)": {
      avancoFisico: 92,
      custos: [
        { categoria: "material_ca", orcado: 2_800, realizado: 2_750 },
        { categoria: "material_cc", orcado: 18_500, realizado: 18_500 },
        { categoria: "mao_de_obra", orcado: 4_700, realizado: 4_300 },
      ],
      financeiro: { receitaLiquida: 36_000, custoOrcado: 26_000, custoRealizado: 25_550, custoFinalProjetado: 26_100, margemPlanejadaPct: (10_000 / 36_000) * 100 },
    },
  };
}

/** Planejamento fictício da obra, só com a demonstração ativa; null caso contrário. */
export function planejamentoDemonstracao(clienteNome: string, env: Record<string, string | undefined> = process.env): PlanejamentoObra | null {
  if (!demonstracaoAtiva(env)) return null;
  return planejamentos()[clienteNome] ?? null;
}
