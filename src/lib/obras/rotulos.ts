/**
 * Status e rótulos (pt-BR) dos setores de Obras. As listas, na ordem do fluxo, espelham
 * o CHECK `obra_fluxos_status_valido` (migration 20261006220000_obras_base.sql).
 * Módulo puro: sem Supabase.
 */

export const SETORES_OPERACIONAIS = ["compras", "engenharia", "operacional"] as const;
export type SetorOperacional = (typeof SETORES_OPERACIONAIS)[number];

export const ROTULO_SETOR: Record<SetorOperacional, string> = {
  compras: "Compras",
  engenharia: "Engenharia",
  operacional: "Operacional",
};

export const STATUS_POR_SETOR = {
  compras: ["a_comprar", "cotando", "pedido_realizado", "faturado_fornecedor"],
  engenharia: [
    "a_iniciar",
    "projeto_em_elaboracao",
    "enviado_concessionaria",
    "aprovado",
    "aguardando_vistoria",
    "concluido",
  ],
  operacional: [
    "aguardando_liberacao",
    "liberada_agendamento",
    "agendada",
    "em_instalacao",
    "instalacao_concluida",
    "concluido",
  ],
} as const satisfies Record<SetorOperacional, readonly string[]>;

/** Primeiro status do fluxo (o que a obra recebe ao nascer). */
export const STATUS_INICIAL: Record<SetorOperacional, string> = {
  compras: "a_comprar",
  engenharia: "a_iniciar",
  operacional: "aguardando_liberacao",
};

/** Último status do fluxo: o setor terminou o trabalho dele. */
export const STATUS_FINAL: Record<SetorOperacional, string> = {
  compras: "faturado_fornecedor",
  engenharia: "concluido",
  operacional: "concluido",
};

export const ROTULO_STATUS: Record<SetorOperacional, Record<string, string>> = {
  compras: {
    a_comprar: "A comprar",
    cotando: "Cotando",
    pedido_realizado: "Pedido realizado",
    faturado_fornecedor: "Faturado pelo fornecedor",
  },
  engenharia: {
    a_iniciar: "A iniciar",
    projeto_em_elaboracao: "Projeto em elaboração",
    enviado_concessionaria: "Enviado à concessionária",
    aprovado: "Aprovado",
    aguardando_vistoria: "Aguardando vistoria",
    concluido: "Concluído",
  },
  operacional: {
    aguardando_liberacao: "Aguardando liberação",
    liberada_agendamento: "Liberada para agendamento",
    agendada: "Agendada",
    em_instalacao: "Em instalação",
    instalacao_concluida: "Instalação concluída",
    concluido: "Concluído",
  },
};

/** Rótulo do status; um valor desconhecido aparece como veio (nunca esconde o dado). */
export function rotuloStatus(setor: SetorOperacional, status: string): string {
  return ROTULO_STATUS[setor][status] ?? status;
}

export const ROTULO_AGUARDANDO: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  concessionaria: "Concessionária",
  transportadora: "Transportadora",
  equipe_campo: "Equipe de campo",
};

export const ROTULO_MARCO: Record<string, string> = {
  nf_cliente: "NF do cliente",
  garantia: "Garantia",
};

export const ROTULO_STATUS_MARCO: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  nao_se_aplica: "Não se aplica",
};

export const ROTULO_TIPO_LIGACAO: Record<string, string> = {
  monofasico: "Monofásico",
  bifasico: "Bifásico",
  trifasico: "Trifásico",
};
