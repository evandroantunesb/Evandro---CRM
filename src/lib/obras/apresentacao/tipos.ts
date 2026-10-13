import type { AlertaObra, SetorObra, SituacaoObra } from "../rotulos";

/**
 * Modo Apresentação de Obras (OPR 3B, V1). Somente leitura.
 *
 * Fontes reais HOJE (banco): identificação da obra, situação, status/parado/aguardando de cada
 * setor, responsáveis, marcos, alertas e o valor vendido (RLS própria). NÃO existem no banco:
 * prazo, cronograma, avanço físico, custos por categoria, receita líquida e margem. Esses blocos
 * chegam `null` (estado vazio na tela) e só ganham conteúdo pela demonstração local
 * (`demo.ts`), que nunca liga fora do Supabase local.
 */

export type AtividadeCronograma = {
  id: string;
  nome: string;
  /** Setor da obra a que a atividade pertence (opcional). */
  setor: SetorObra | null;
  /** Datas ISO (AAAA-MM-DD), inclusivas. */
  inicio: string;
  fim: string;
  /** 0–100, informado pela fonte. Nunca derivado do status do setor. */
  progresso: number;
  /** Marco pontual (desenhado como losango, sem barra). */
  marco?: boolean;
};

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

/** Dados de planejamento/custo de uma obra. Hoje só existem na demonstração local. */
export type PlanejamentoObra = {
  /** Data de término prevista (ISO). */
  prazo: string | null;
  /** 0–100, informado pela fonte. */
  avancoFisico: number | null;
  cronograma: AtividadeCronograma[];
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
  /** Planejamento: null = sem fonte (estado vazio). */
  prazo: string | null;
  avancoFisico: number | null;
  cronograma: AtividadeCronograma[] | null;
  /** Custos e resultado: só para quem pode ver dinheiro desta obra. */
  financeiro: FinanceiroVM;
  /** true quando o conteúdo de planejamento/custos veio da demonstração local (fictícia). */
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
