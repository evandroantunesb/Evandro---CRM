/**
 * Nomes dos campos ocultos do formulário que carregam a escolha do painel de
 * dimensionamento (motor único, `src/lib/dimensionamento.ts`) até a server
 * action `criarNegocio` (`src/lib/acoes/negocios.ts`). Antes da Fase 3 esses
 * nomes eram strings repetidas entre o componente de campos ocultos e o
 * schema Zod da action — bastava um erro de digitação num dos dois lados pra
 * o dimensionamento sumir silenciosamente do negócio criado. Centralizados
 * aqui, os dois lados (o componente que renderiza os `<input type="hidden">`
 * e o schema que os lê) importam a mesma constante.
 */
export const CAMPOS_DIMENSIONAMENTO = {
  moduloId: "dimensionamento_modulo_id",
  inversorId: "dimensionamento_inversor_id",
  quantidadeModulos: "dimensionamento_quantidade_modulos",
  produtividadeKwhKwpMes: "dimensionamento_produtividade_kwh_kwp_mes",
  origemProdutividade: "dimensionamento_origem_produtividade",
} as const;

export type CampoDimensionamento = (typeof CAMPOS_DIMENSIONAMENTO)[keyof typeof CAMPOS_DIMENSIONAMENTO];
