/**
 * Protocolos da Engenharia na concessionária (20261030120000_engenharia_protocolos.sql). Regras puras da tela:
 * rótulos e quais registros cabem em cada situação. Espelham a RPC, que confere de novo.
 */

export const CANAIS_PROTOCOLO = ["pew", "caw", "atendimento", "outro"] as const;
export const ROTULO_CANAL: Record<(typeof CANAIS_PROTOCOLO)[number], string> = {
  pew: "PEW (portal da Copel)",
  caw: "CAW",
  atendimento: "Atendimento comercial",
  outro: "Outro",
};

export const TIPOS_SOLICITACAO = ["nova_conexao", "ampliacao", "regularizacao", "outro"] as const;
export const ROTULO_TIPO_SOLICITACAO: Record<(typeof TIPOS_SOLICITACAO)[number], string> = {
  nova_conexao: "Nova conexão",
  ampliacao: "Ampliação",
  regularizacao: "Regularização",
  outro: "Outro",
};

export const STATUS_PROTOCOLO = ["protocolado", "em_analise", "com_exigencia", "aprovado", "orcamento_emitido", "indeferido", "cancelado", "encerrado"] as const;
export type StatusProtocolo = (typeof STATUS_PROTOCOLO)[number];
export const ROTULO_STATUS_PROTOCOLO: Record<StatusProtocolo, string> = {
  protocolado: "Protocolado",
  em_analise: "Em análise",
  com_exigencia: "Com exigência",
  aprovado: "Aprovado",
  orcamento_emitido: "Orçamento emitido",
  indeferido: "Indeferido",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
};
export const protocoloEncerrado = (s: StatusProtocolo) => s === "indeferido" || s === "cancelado" || s === "encerrado";

export const TIPOS_EVENTO = ["registrado", "em_analise", "exigencia", "reenvio", "aprovado", "orcamento_emitido", "indeferido", "cancelado", "encerrado"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  registrado: "Protocolo registrado",
  em_analise: "Em análise",
  exigencia: "Exigência recebida",
  reenvio: "Reenviado com correções",
  aprovado: "Aprovado",
  orcamento_emitido: "Orçamento de conexão emitido",
  indeferido: "Indeferido",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
};
/** O que o engenheiro pode registrar (o "registrado" nasce do protocolo). */
export const TIPOS_RESPOSTA = ["em_analise", "exigencia", "reenvio", "aprovado", "orcamento_emitido", "indeferido", "cancelado", "encerrado"] as const;
export type TipoResposta = (typeof TIPOS_RESPOSTA)[number];

export const CATEGORIAS_EXIGENCIA = [
  "cadastral",
  "documento_faltante",
  "documento_ilegivel",
  "projeto_eletrico",
  "art",
  "inversor",
  "protecao",
  "padrao_entrada",
  "rede",
  "outro",
] as const;
export const ROTULO_CATEGORIA: Record<(typeof CATEGORIAS_EXIGENCIA)[number], string> = {
  cadastral: "Cadastral",
  documento_faltante: "Documento faltante",
  documento_ilegivel: "Documento ilegível",
  projeto_eletrico: "Projeto elétrico",
  art: "ART",
  inversor: "Inversor / certificação",
  protecao: "Proteção / parametrização",
  padrao_entrada: "Padrão de entrada",
  rede: "Rede / inversão de fluxo / obra de rede",
  outro: "Outro",
};

export const STATUS_EXIGENCIA = ["aberta", "reenviada", "resolvida"] as const;
export type StatusExigencia = (typeof STATUS_EXIGENCIA)[number];
export const ROTULO_STATUS_EXIGENCIA: Record<StatusExigencia, string> = { aberta: "Aberta", reenviada: "Reenviada", resolvida: "Resolvida" };

/** Registros que cabem em cada situação (mesma tabela da RPC). */
const PROXIMOS: Record<StatusProtocolo, TipoResposta[]> = {
  protocolado: ["em_analise", "exigencia", "aprovado", "orcamento_emitido", "indeferido", "cancelado"],
  em_analise: ["exigencia", "aprovado", "orcamento_emitido", "indeferido", "cancelado"],
  com_exigencia: ["exigencia", "reenvio", "indeferido", "cancelado"],
  aprovado: ["encerrado", "cancelado"],
  orcamento_emitido: ["encerrado", "cancelado"],
  indeferido: [],
  cancelado: [],
  encerrado: [],
};
export const respostasPossiveis = (s: StatusProtocolo): TipoResposta[] => PROXIMOS[s];
/** Exigência, indeferido e cancelado pedem o texto da distribuidora (ou o motivo). */
export const exigeDescricao = (t: TipoResposta) => t === "exigencia" || t === "indeferido" || t === "cancelado";

const ehDe = <T extends string>(lista: readonly T[], v: string, padrao: T): T => ((lista as readonly string[]).includes(v) ? (v as T) : padrao);
export const statusProtocolo = (s: string) => ehDe(STATUS_PROTOCOLO, s, "protocolado");
export const tipoEvento = (s: string) => ehDe(TIPOS_EVENTO, s, "em_analise");
export const statusExigencia = (s: string) => ehDe(STATUS_EXIGENCIA, s, "aberta");
export const rotuloDe = <K extends string>(tabela: Record<K, string>, v: string) => (Object.hasOwn(tabela, v) ? tabela[v as K] : v);

export type ArquivoProtocoloVM = { id: string; nome: string };
export type EventoProtocoloVM = {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  descricao: string | null;
  autor: string | null;
  arquivos: ArquivoProtocoloVM[];
  /** Pacote enviado (registro e reenvio): item do checklist e versão do arquivo. */
  pacote: { item: string; versao: number }[];
};
export type ExigenciaVM = { id: string; categoria: string; descricao: string; prazoInterno: string | null; status: StatusExigencia };
export type ProtocoloVM = {
  id: string;
  distribuidora: string;
  canal: string;
  numero: string;
  tipoSolicitacao: string;
  protocoladoEm: string;
  status: StatusProtocolo;
  observacao: string | null;
  eventos: EventoProtocoloVM[];
  exigencias: ExigenciaVM[];
};
