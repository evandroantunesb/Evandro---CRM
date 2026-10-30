/**
 * Vistoria, medição e conexão da Engenharia (20261030140000_engenharia_vistoria.sql). Regras puras da tela: rótulos,
 * registros que cabem em cada situação e a ação que a vistoria pede na central. Espelham a RPC, que confere de novo.
 */

export const STATUS_VISTORIA = ["solicitada", "agendada", "aprovada", "com_nao_conformidade", "cancelada"] as const;
export type StatusVistoria = (typeof STATUS_VISTORIA)[number];
export const ROTULO_STATUS_VISTORIA: Record<StatusVistoria, string> = {
  solicitada: "Solicitada",
  agendada: "Agendada",
  aprovada: "Aprovada",
  com_nao_conformidade: "Com não conformidade",
  cancelada: "Cancelada",
};
/** Pedido que ainda vale (bloqueia um novo pedido). */
export const vistoriaAtiva = (s: StatusVistoria) => s === "solicitada" || s === "agendada" || s === "aprovada";

export const TIPOS_EVENTO_VISTORIA = ["solicitada", "agendada", "aprovada", "nao_conformidade", "cancelada", "medidor_adequado", "conexao_confirmada"] as const;
export type TipoEventoVistoria = (typeof TIPOS_EVENTO_VISTORIA)[number];
export const ROTULO_EVENTO_VISTORIA: Record<TipoEventoVistoria, string> = {
  solicitada: "Vistoria solicitada",
  agendada: "Vistoria agendada",
  aprovada: "Vistoria aprovada",
  nao_conformidade: "Não conformidade apontada",
  cancelada: "Pedido cancelado",
  medidor_adequado: "Medidor adequado",
  conexao_confirmada: "Conexão confirmada",
};
/** O que o engenheiro pode registrar (o "solicitada" nasce do pedido). */
export const TIPOS_REGISTRO_VISTORIA = ["agendada", "aprovada", "nao_conformidade", "cancelada", "medidor_adequado", "conexao_confirmada"] as const;
export type TipoRegistroVistoria = (typeof TIPOS_REGISTRO_VISTORIA)[number];

/** Registros que cabem na vistoria (mesma tabela da RPC). Na aprovada: medidor, depois conexão, uma vez cada. */
export function registrosPossiveis(v: { status: StatusVistoria; medidorAdequadoEm: string | null; conexaoConfirmadaEm: string | null }): TipoRegistroVistoria[] {
  if (v.status === "solicitada" || v.status === "agendada") return ["agendada", "aprovada", "nao_conformidade", "cancelada"];
  if (v.status !== "aprovada") return [];
  if (!v.medidorAdequadoEm) return ["medidor_adequado"];
  if (!v.conexaoConfirmadaEm) return ["conexao_confirmada"];
  return [];
}
/** Não conformidade e cancelamento pedem o que foi apontado (ou o motivo). */
export const registroExigeDescricao = (t: TipoRegistroVistoria) => t === "nao_conformidade" || t === "cancelada";
/** Só a data agendada pode ser futura. */
export const aceitaDataFutura = (t: TipoRegistroVistoria) => t === "agendada";

/** Por que ainda não dá para pedir a vistoria (gate G5), ou null se dá. */
export function bloqueioPedidoVistoria({ protocoloAprovado, instalacaoConcluida }: { protocoloAprovado: boolean; instalacaoConcluida: boolean }): string | null {
  if (!protocoloAprovado) return "A vistoria pode ser pedida depois que o protocolo for aprovado (ou o orçamento de conexão emitido).";
  if (!instalacaoConcluida) return "A vistoria pode ser pedida depois que o Operacional concluir a instalação.";
  return null;
}

/** Situação para quem vê a obra sem ser da Engenharia (Operacional, comercial): só situação e datas. */
export type SituacaoVistoria = {
  status: StatusVistoria;
  solicitadaEm: string;
  agendadaPara: string | null;
  realizadaEm: string | null;
  medidorAdequadoEm: string | null;
  conexaoConfirmadaEm: string | null;
};

/**
 * Ação da Engenharia que a vistoria pede (central): não conformidade sem novo pedido → corrigir; conexão confirmada →
 * concluir. Nos demais casos a próxima movimentação é da distribuidora (ou a etapa já diz o que fazer): null.
 */
export function acaoVistoria(v: Pick<SituacaoVistoria, "status" | "conexaoConfirmadaEm">): string | null {
  if (v.status === "com_nao_conformidade") return "Corrigir a não conformidade e pedir nova vistoria";
  if (v.status === "aprovada" && v.conexaoConfirmadaEm) return "Concluir a Engenharia";
  return null;
}

const ehDe = <T extends string>(lista: readonly T[], v: string, padrao: T): T => ((lista as readonly string[]).includes(v) ? (v as T) : padrao);
export const statusVistoria = (s: string) => ehDe(STATUS_VISTORIA, s, "solicitada");
export const tipoEventoVistoria = (s: string) => ehDe(TIPOS_EVENTO_VISTORIA, s, "solicitada");

export type ArquivoVistoriaVM = { id: string; nome: string };
export type EventoVistoriaVM = {
  id: string;
  tipo: TipoEventoVistoria;
  ocorridoEm: string;
  descricao: string | null;
  autor: string | null;
  arquivos: ArquivoVistoriaVM[];
};
export type VistoriaVM = SituacaoVistoria & {
  id: string;
  numero: string | null;
  eventos: EventoVistoriaVM[];
};
