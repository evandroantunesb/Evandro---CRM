/**
 * Regras puras das tarefas de setor, usadas no servidor e na tela: setores, filtros, prazo em dias úteis e o
 * formato que a tela recebe (montado em `@/lib/tarefas-setor`).
 */

export const SETORES_TAREFA = ["compras", "engenharia", "operacional", "administrativo"] as const;
export type SetorTarefa = (typeof SETORES_TAREFA)[number];
export type StatusTarefaSetor = "aberta" | "concluida" | "cancelada";

export const FILTROS_TAREFAS_SETOR = ["abertas", "minhas", "fila", "pedidas", "concluidas"] as const;
export type FiltroTarefasSetor = (typeof FILTROS_TAREFAS_SETOR)[number];
export const ROTULO_FILTRO_TAREFAS_SETOR: Record<FiltroTarefasSetor, string> = {
  abertas: "Abertas",
  minhas: "Comigo",
  fila: "Na fila do setor",
  pedidas: "Pedidas por mim",
  concluidas: "Concluídas",
};

/** Prazo sugerido ao criar: 2 dias úteis (decisão de 29/10/2026). */
export const PRAZO_PADRAO_DIAS_UTEIS = 2;

export type MembroOpcao = { id: string; nome: string };

export type TarefaSetorVM = {
  id: string;
  titulo: string;
  descricao: string | null;
  setor: SetorTarefa;
  setorRotulo: string;
  prazo: string;
  status: StatusTarefaSetor;
  atrasada: boolean;
  resposta: string | null;
  motivoCancelamento: string | null;
  automatica: boolean;
  responsavel: MembroOpcao | null;
  pedidoPor: string | null;
  referencia: { rotulo: string; href: string | null };
  obraId: string | null;
  negocioId: string | null;
  /** A sessão é o substituto do setor nesta obra e a tarefa está com o principal: o nome dele. */
  substituindo: string | null;
  /** Concluir com resposta. */
  podeAgir: boolean;
  /** Assumir para si: só quem atua no setor (admin e gestor não assumem; atribuem). */
  podeAssumir: boolean;
  podeAtribuir: boolean;
  podeCancelar: boolean;
  podeReabrir: boolean;
  /** Anexar só com a tarefa aberta (a RPC e o Storage conferem de novo). */
  podeAnexar: boolean;
  /** Pasta da tarefa no Storage (`empresa/tarefa`). */
  pastaAnexos: string;
  anexos: AnexoTarefaVM[];
};

/** `doPedido`: enviado por quem pediu (fotos, referências); senão, entregue por quem executou (3D, orçamento). */
export type AnexoTarefaVM = { id: string; nome: string; enviadoPor: string | null; podeRemover: boolean; doPedido: boolean };

/** Bucket dos anexos das tarefas (20261029230000_tarefas_setor_anexos.sql), pasta `empresa/tarefa/objeto`. */
export const BUCKET_ANEXOS_TAREFA = "tarefas-setor";

/** Hoje no horário de Brasília (AAAA-MM-DD), para comparar com o prazo. */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Soma dias úteis (segunda a sexta, sem feriados) a uma data AAAA-MM-DD. */
export function somarDiasUteis(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  let faltam = dias;
  while (faltam > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const semana = d.getUTCDay();
    if (semana !== 0 && semana !== 6) faltam--;
  }
  return d.toISOString().slice(0, 10);
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export const dataBr = (data: string) => data.split("-").reverse().join("/");

type LinhaAberta = { responsavel_id: string | null; criado_por: string | null; setor: string; obra_id?: string | null };

/** Onde a pessoa é substituta (`minhas_substituicoes`, 20261123100000): obra, setor e o principal (pode faltar). */
export type Substituicao = { obraId: string; setor: string; principalId: string | null };

/**
 * A tarefa conta como "comigo" para o substituto quando é da obra e do setor em que ele substitui e está com o
 * responsável principal (decisão de 05/11/2026: a tarefa não muda de dono; o substituto recebe junto).
 */
export function substituicaoDaTarefa(
  t: { obra_id?: string | null; setor: string; responsavel_id: string | null },
  substituicoes: readonly Substituicao[],
): Substituicao | null {
  if (!t.obra_id || !t.responsavel_id) return null;
  return substituicoes.find((s) => s.obraId === t.obra_id && s.setor === t.setor && s.principalId === t.responsavel_id) ?? null;
}

const comigo = (t: LinhaAberta, membroId: string, substituicoes: readonly Substituicao[]) =>
  t.responsavel_id === membroId || substituicaoDaTarefa(t, substituicoes) != null;

/** Quantas tarefas abertas há em cada aba (Concluídas não conta: não é pendência). */
export function contarAbertasPorAba(
  linhas: LinhaAberta[],
  membroId: string,
  substituicoes: readonly Substituicao[] = [],
): Record<Exclude<FiltroTarefasSetor, "concluidas">, number> {
  return {
    abertas: linhas.length,
    minhas: linhas.filter((t) => comigo(t, membroId, substituicoes)).length,
    fila: linhas.filter((t) => t.responsavel_id === null).length,
    pedidas: linhas.filter((t) => t.criado_por === membroId).length,
  };
}

/**
 * Pendências de quem executa: as tarefas abertas com a pessoa (ou com o principal que ela substitui) e as da fila
 * dos setores em que ela atua.
 */
export function contarPendenciasDoSetor(
  linhas: LinhaAberta[],
  membroId: string,
  meusSetores: readonly string[],
  substituicoes: readonly Substituicao[] = [],
): number {
  return linhas.filter((t) => comigo(t, membroId, substituicoes) || (t.responsavel_id === null && meusSetores.includes(t.setor))).length;
}
