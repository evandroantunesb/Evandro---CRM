import type { CronogramaVM } from "../cronograma";
import type { CustosObraVM, ResultadoObraVM } from "../custos";
import type { AlertaObra, SetorObra, SituacaoObra } from "../rotulos";

/**
 * Modo Apresentação de Obras (OPR 3B, V1). Somente leitura.
 *
 * Fontes reais HOJE (banco): identificação da obra, situação, status/parado/aguardando de cada
 * setor, responsáveis, marcos, alertas, o valor vendido (RLS própria), o cronograma das etapas
 * com a entrega contratada (`cronograma_obra`) e os custos com o lucro (`obra_orcamento`,
 * `obra_custos`, `obra_deducoes`). NÃO existe no banco: o avanço físico, que chega `null` e só
 * ganha conteúdo pela demonstração local (`demo.ts`), que nunca liga fora do Supabase local.
 */

/** Avanço de uma obra. Hoje só existe na demonstração local. */
export type PlanejamentoObra = {
  /** 0–100, informado pela fonte. */
  avancoFisico: number | null;
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
  /** Custos (quem vê custos) e lucro (quem vê o valor vendido). */
  financeiro: FinanceiroVM;
  /** true quando o avanço veio da demonstração local (fictícia). */
  demonstracao: boolean;
};

/**
 * Bloco financeiro já filtrado no servidor:
 * - `sem_permissao`: quem não vê os custos desta obra (nada de valores no payload);
 * - `disponivel`: custos por categoria; `resultado` (venda, lucro, margem) só para quem vê o valor vendido.
 */
export type FinanceiroVM = { estado: "sem_permissao" } | { estado: "disponivel"; custos: CustosObraVM; resultado: ResultadoObraVM | null };
