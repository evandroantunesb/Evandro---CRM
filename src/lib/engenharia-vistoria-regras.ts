/**
 * Vistoria, medição e conexão da Engenharia (20261030140000_engenharia_vistoria.sql). Regras puras da tela: rótulos,
 * registros que cabem em cada situação e a ação que a vistoria pede na central. Espelham a RPC, que confere de novo.
 */

export const STATUS_VISTORIA = ["solicitada", "agendada", "realizada", "aprovada", "com_nao_conformidade", "cancelada"] as const;
export type StatusVistoria = (typeof STATUS_VISTORIA)[number];
export const ROTULO_STATUS_VISTORIA: Record<StatusVistoria, string> = {
  solicitada: "Solicitada",
  agendada: "Agendada",
  realizada: "Realizada, aguardando resultado",
  aprovada: "Aprovada",
  com_nao_conformidade: "Com não conformidade",
  cancelada: "Cancelada",
};
/** Pedido que ainda vale (bloqueia um novo pedido). */
export const vistoriaAtiva = (s: StatusVistoria) => s === "solicitada" || s === "agendada" || s === "realizada" || s === "aprovada";

export const TIPOS_EVENTO_VISTORIA = [
  "solicitada",
  "agendada",
  "realizada",
  "aprovada",
  "nao_conformidade",
  "correcao_campo",
  "cancelada",
  "medidor_adequado",
  "conexao_confirmada",
] as const;
export type TipoEventoVistoria = (typeof TIPOS_EVENTO_VISTORIA)[number];
export const ROTULO_EVENTO_VISTORIA: Record<TipoEventoVistoria, string> = {
  solicitada: "Vistoria solicitada",
  agendada: "Vistoria agendada",
  realizada: "Vistoria realizada em campo",
  aprovada: "Vistoria aprovada",
  nao_conformidade: "Não conformidade apontada",
  correcao_campo: "Correção de campo feita",
  cancelada: "Pedido cancelado",
  medidor_adequado: "Medidor adequado",
  conexao_confirmada: "Conexão confirmada",
};
/** O que se registra depois do pedido (o "solicitada" nasce do pedido, que é da Engenharia). */
export const TIPOS_REGISTRO_VISTORIA = [
  "agendada",
  "realizada",
  "aprovada",
  "nao_conformidade",
  "correcao_campo",
  "cancelada",
  "medidor_adequado",
  "conexao_confirmada",
] as const;
export type TipoRegistroVistoria = (typeof TIPOS_REGISTRO_VISTORIA)[number];

/** Em quais setores a pessoa atua nesta obra (admin: nos dois). */
export type AtuacaoVistoria = { engenharia: boolean; operacional: boolean };

/**
 * Quem registra cada tipo (decisão do Evandro de 30/10, "os dois"; mesma regra de `setor_registro_vistoria`):
 * agendamento e vistoria realizada, Engenharia ou Operacional; correção de campo, Operacional; o resto, Engenharia.
 */
export function podeRegistrar(t: TipoRegistroVistoria, atuo: AtuacaoVistoria): boolean {
  if (t === "agendada" || t === "realizada") return atuo.engenharia || atuo.operacional;
  if (t === "correcao_campo") return atuo.operacional;
  return atuo.engenharia;
}

/** Registros que cabem na vistoria (mesma tabela da RPC) e que a pessoa pode fazer. Na aprovada: medidor, depois conexão. */
export function registrosPossiveis(
  v: { status: StatusVistoria; medidorAdequadoEm: string | null; conexaoConfirmadaEm: string | null },
  atuo: AtuacaoVistoria,
): TipoRegistroVistoria[] {
  const cabem = ((): TipoRegistroVistoria[] => {
    if (v.status === "solicitada" || v.status === "agendada") return ["agendada", "realizada", "aprovada", "nao_conformidade", "cancelada"];
    if (v.status === "realizada") return ["aprovada", "nao_conformidade", "cancelada"];
    if (v.status === "com_nao_conformidade") return ["correcao_campo"];
    if (v.status !== "aprovada") return [];
    if (!v.medidorAdequadoEm) return ["medidor_adequado"];
    if (!v.conexaoConfirmadaEm) return ["conexao_confirmada"];
    return [];
  })();
  return cabem.filter((t) => podeRegistrar(t, atuo));
}
/** Não conformidade, correção de campo e cancelamento pedem texto (o apontado, o corrigido ou o motivo). */
export const registroExigeDescricao = (t: TipoRegistroVistoria) => t === "nao_conformidade" || t === "correcao_campo" || t === "cancelada";

/** Bucket dos arquivos da vistoria: separado dos documentos da Engenharia (o Operacional também lê e envia). */
export const BUCKET_ARQUIVOS_VISTORIA = "vistoria-arquivos";

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
 * Ação da Engenharia que a vistoria pede (central): realizada em campo → registrar o resultado; não conformidade sem
 * novo pedido → corrigir; conexão confirmada → concluir. Nos demais casos a próxima movimentação é da distribuidora (ou a etapa já diz o que fazer): null.
 */
export function acaoVistoria(v: Pick<SituacaoVistoria, "status" | "conexaoConfirmadaEm">): string | null {
  if (v.status === "realizada") return "Registrar o resultado da vistoria";
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
