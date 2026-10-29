/**
 * Regras puras das tarefas de setor, usadas no servidor e na tela: setores, filtros, prazo em dias úteis e o
 * formato que a tela recebe (montado em `@/lib/tarefas-setor`).
 */

export const SETORES_TAREFA = ["compras", "engenharia", "operacional"] as const;
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
  podeAgir: boolean;
  podeAtribuir: boolean;
  podeCancelar: boolean;
  podeReabrir: boolean;
};

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
