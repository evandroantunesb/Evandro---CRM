import type { CronogramaVM } from "../cronograma";
import type { AlertaObra, SetorObra, SituacaoObra } from "../rotulos";

/**
 * Modo Apresentação de Obras (OPR 3B, V1). Somente leitura.
 *
 * Fontes reais HOJE (banco): identificação da obra, situação, status/parado/aguardando de cada
 * setor, responsáveis, marcos, alertas, o valor vendido (RLS própria) e o cronograma das etapas
 * com a entrega contratada (`cronograma_obra`). NÃO existem no banco: avanço físico, custos por
 * categoria, receita líquida e margem. Esses blocos chegam `null` (estado vazio na tela) e só
 * ganham conteúdo pela demonstração local (`demo.ts`), que nunca liga fora do Supabase local.
 */

export const CATEGORIAS_CUSTO = ["material_ca", "material_cc", "mao_de_obra", "equipamentos", "servicos", "logistica"] as const;
export type CategoriaCusto = (typeof CATEGORIAS_CUSTO)[number];

export const ROTULO_CATEGORIA_CUSTO: Record<CategoriaCusto, string> = {
  material_ca: "Material CA",
  material_cc: "Material CC",
  mao_de_obra: "Mão de obra",
  equipamentos: "Equipamentos",
  servicos: "Serviços",
  logistica: "Logística",
};

export type CustoCategoria = { categoria: CategoriaCusto; orcado: number; realizado: number };

/** Entradas do resultado financeiro. A margem é sempre calculada sobre o custo FINAL projetado. */
export type EntradaFinanceiro = {
  receitaLiquida: number;
  /** Soma do orçado por categoria. */
  custoOrcado: number;
  /** Gasto até hoje (soma do realizado por categoria). */
  custoRealizado: number;
  /** Realizado + o que ainda falta gastar (estimado). Nunca menor que o realizado. */
  custoFinalProjetado: number;
  /** Margem prevista na venda, para comparar (opcional). */
  margemPlanejadaPct: number | null;
};

/** Avanço e custos de uma obra. Hoje só existem na demonstração local. */
export type PlanejamentoObra = {
  /** 0–100, informado pela fonte. */
  avancoFisico: number | null;
  custos: CustoCategoria[];
  financeiro: EntradaFinanceiro | null;
};

export type SetorApresentacaoVM = {
  setor: SetorObra;
  statusRotulo: string;
  concluido: boolean;
  parado: boolean;
  aguardando: string | null;
  responsavel: string | null;
};

export type PendenciaVM = { tipo: "parado" | "aguardando" | "alerta" | "marco"; texto: string };

export type ApresentacaoObraVM = {
  id: string;
  numero: number;
  clienteNome: string;
  local: string | null;
  potenciaKwp: number | null;
  situacao: SituacaoObra;
  alertas: AlertaObra[];
  setores: SetorApresentacaoVM[];
  /** Fatos do banco: setores parados/aguardando, alertas da venda. */
  pendencias: PendenciaVM[];
  /** Fatos do banco: marcos ainda pendentes e setores não concluídos (status atual). */
  proximasEntregas: string[];
  /** Datas ISO (AAAA-MM-DD) do cronograma; null = sem acesso ao cronograma. */
  entregaContratada: string | null;
  entregaPrevista: string | null;
  /** Avanço: null = sem fonte (estado vazio). */
  avancoFisico: number | null;
  cronograma: CronogramaVM | null;
  /** Custos e resultado: só para quem pode ver dinheiro desta obra. */
  financeiro: FinanceiroVM;
  /** true quando o avanço e os custos vieram da demonstração local (fictícia). */
  demonstracao: boolean;
};

/**
 * Bloco financeiro já filtrado no servidor:
 * - `sem_permissao`: o papel/pessoa não vê dinheiro desta obra (nada de valores no payload);
 * - `sem_dados`: pode ver, mas não há fonte de custos/margem (só o valor vendido, se houver);
 * - `disponivel`: custos e resultado (hoje só na demonstração).
 */
export type FinanceiroVM =
  | { estado: "sem_permissao" }
  | { estado: "sem_dados"; valorVendido: number | null }
  | { estado: "disponivel"; valorVendido: number | null; custos: CustoCategoria[]; resultado: EntradaFinanceiro };
