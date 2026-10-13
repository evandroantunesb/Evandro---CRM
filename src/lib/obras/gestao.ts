import type { SetorObra } from "./rotulos";

/**
 * Modo Gestão de Obras: quais controles de escrita MOSTRAR para quem. Espelho, só para a
 * interface, de `autorizacao_setor_obra` / `preparar_escrita_obra` (migration
 * 20261008100000_obras_escrita_operacao.sql). Quem decide de fato é sempre a RPC no banco:
 * esconder um controle aqui nunca é a barreira, e mostrá-lo nunca concede nada.
 *
 *   admin da empresa ................................ 'admin'      (qualquer setor operacional)
 *   operacao que COORDENA o setor ................... 'coordenar'  (mesmo sem participar)
 *   operacao com o setor E participante ativo nele .. 'executar'
 *   qualquer outro (gestor, vendedor, SDR, ...) ..... null
 *
 * Coordenar e admin gerem participantes; executar só altera fluxo e marcos. Obra cancelada
 * não aceita nada; obra pausada bloqueia fluxos e marcos, mas permite gerir participantes.
 */

export type AutorizacaoSetor = "admin" | "coordenar" | "executar";

export type SetorDoMembro = { setor: string; capacidade: string };

export type EntradaAutorizacao = {
  papel: string | null | undefined;
  /** Setores do próprio membro (`membro_setores_obra`); só faz diferença para `operacao`. */
  setoresDoMembro: readonly SetorDoMembro[];
  /** Setores em que o próprio membro é participante ATIVO desta obra. */
  setoresParticipando: readonly string[];
};

export function autorizacaoSetor(entrada: EntradaAutorizacao, setor: SetorObra): AutorizacaoSetor | null {
  if (entrada.papel === "admin") return "admin";
  // Lista positiva: só `operacao` chega aos setores; qualquer outro papel cai no null final.
  if (entrada.papel === "operacao") {
    const meu = entrada.setoresDoMembro.find((s) => s.setor === setor);
    if (meu?.capacidade === "coordenar") return "coordenar";
    if (meu && entrada.setoresParticipando.includes(setor)) return "executar";
  }
  return null;
}

export type EstadoEscritaObra = { cancelada: boolean; pausada: boolean };

export type PermissoesSetor = {
  autorizacao: AutorizacaoSetor | null;
  /** Status, parado e aguardando. */
  alterarFluxo: boolean;
  /** Atribuir, substituir e encerrar participantes. */
  gerirParticipantes: boolean;
};

export function permissoesSetor(entrada: EntradaAutorizacao, setor: SetorObra, obra: EstadoEscritaObra): PermissoesSetor {
  const autorizacao = autorizacaoSetor(entrada, setor);
  if (!autorizacao || obra.cancelada) return { autorizacao, alterarFluxo: false, gerirParticipantes: false };
  return {
    autorizacao,
    alterarFluxo: !obra.pausada,
    gerirParticipantes: autorizacao === "admin" || autorizacao === "coordenar",
  };
}

/** Marcos (NF do cliente, garantia) pertencem ao setor operacional. */
export const podeAtualizarMarcos = (entrada: EntradaAutorizacao, obra: EstadoEscritaObra) =>
  permissoesSetor(entrada, "operacional", obra).alterarFluxo;

/** Motivo do bloqueio para exibir quando a pessoa teria permissão, mas a obra não aceita. */
export function bloqueioDaObra(obra: EstadoEscritaObra): string | null {
  if (obra.cancelada) return "Obra cancelada: não aceita alterações.";
  if (obra.pausada) return "Obra pausada: status, paradas, pendências e marcos ficam bloqueados até ela ser retomada.";
  return null;
}

/** Funções que o modo Gestão atribui (vendedor e SDR são do Comercial e não passam por aqui). */
export const FUNCOES_OPERACIONAIS = ["responsavel", "apoio", "substituto"] as const;
export type FuncaoOperacional = (typeof FUNCOES_OPERACIONAIS)[number];
