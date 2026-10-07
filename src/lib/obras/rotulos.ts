/**
 * Rótulos em português simples para a tela de Obras. Só texto: nenhuma regra de negócio aqui.
 * O banco guarda o status de cada setor como texto livre validado por função (`status` em
 * `obra_fluxos`); por isso um código que não esteja nas listas abaixo nunca quebra a tela —
 * ele aparece cru (`rotuloStatus`).
 */

export const SETORES_OBRA = ["compras", "engenharia", "operacional"] as const;
export type SetorObra = (typeof SETORES_OBRA)[number];

export const ROTULO_SETOR: Record<SetorObra, string> = {
  compras: "Compras",
  engenharia: "Engenharia",
  operacional: "Operacional",
};

/** Status válidos de cada setor, na ordem do fluxo (só para listar; a posição não indica progresso). */
export const STATUS_POR_SETOR: Record<SetorObra, readonly string[]> = {
  compras: ["a_comprar", "cotando", "pedido_realizado", "faturado_fornecedor"],
  engenharia: ["a_iniciar", "projeto_em_elaboracao", "enviado_concessionaria", "aprovado", "aguardando_vistoria", "concluido"],
  operacional: ["aguardando_liberacao", "liberada_agendamento", "agendada", "em_instalacao", "instalacao_concluida", "concluido"],
};

const ROTULO_STATUS: Record<SetorObra, Record<string, string>> = {
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

/** Rótulo do status de um setor. Código desconhecido devolve o próprio código, sem quebrar. */
export function rotuloStatus(setor: SetorObra, status: string): string {
  return Object.hasOwn(ROTULO_STATUS[setor], status) ? ROTULO_STATUS[setor][status] : status;
}

export const AGUARDANDO_OBRA = ["cliente", "fornecedor", "concessionaria", "transportadora", "equipe_campo"] as const;

const ROTULO_AGUARDANDO: Record<(typeof AGUARDANDO_OBRA)[number], string> = {
  cliente: "Aguardando cliente",
  fornecedor: "Aguardando fornecedor",
  concessionaria: "Aguardando concessionária",
  transportadora: "Aguardando transportadora",
  equipe_campo: "Aguardando equipe de campo",
};

/** "Aguardando …" para o código do banco; desconhecido devolve "Aguardando" + código cru. */
export function rotuloAguardando(aguardando: string): string {
  return Object.hasOwn(ROTULO_AGUARDANDO, aguardando)
    ? ROTULO_AGUARDANDO[aguardando as keyof typeof ROTULO_AGUARDANDO]
    : `Aguardando ${aguardando}`;
}

export const SITUACOES_OBRA = ["em_andamento", "concluida", "pausada", "cancelada"] as const;
export type SituacaoObra = (typeof SITUACOES_OBRA)[number];

export const ROTULO_SITUACAO_OBRA: Record<SituacaoObra, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
  cancelada: "Cancelada",
};

export const ALERTAS_OBRA = ["estorno", "venda_alterada", "parado", "aguardando"] as const;
export type AlertaObra = (typeof ALERTAS_OBRA)[number];

export const ROTULO_ALERTA_OBRA: Record<AlertaObra, string> = {
  estorno: "Pagamento estornado",
  venda_alterada: "Venda alterada",
  parado: "Setor parado",
  aguardando: "Aguardando terceiros",
};

export const ESTADOS_SETOR = ["em_andamento", "aguardando", "parado", "concluido"] as const;
export type EstadoSetor = (typeof ESTADOS_SETOR)[number];

export const ROTULO_ESTADO_SETOR: Record<EstadoSetor, string> = {
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  parado: "Parado",
  concluido: "Concluído",
};
