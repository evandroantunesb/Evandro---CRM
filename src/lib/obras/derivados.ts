import type { AlertaObra, EstadoSetor, SetorObra, SituacaoObra } from "./rotulos";

/**
 * Derivações puras e factuais da lista de Obras, a partir de campos que o banco já guarda.
 *
 * Decisão de produto: aqui não existe percentual de progresso (geral ou por setor), posição do
 * status tratada como progresso, SLA, semáforo, contagem de dias/atraso nem cor por tempo.
 * Só se afirma o que está registrado: concluído, parado, aguardando, pausada, cancelada.
 */

/** Status final de cada setor: compras termina em `faturado_fornecedor`; os demais, em `concluido`. */
export function setorConcluido(setor: SetorObra, status: string | null | undefined): boolean {
  return status === (setor === "compras" ? "faturado_fornecedor" : "concluido");
}

/** Estado factual do setor. Concluído vence; depois parado; depois aguardando. */
export function estadoSetor(fluxo: {
  setor: SetorObra;
  status: string | null;
  parado: boolean;
  aguardando: string | null;
}): EstadoSetor {
  if (setorConcluido(fluxo.setor, fluxo.status)) return "concluido";
  if (fluxo.parado) return "parado";
  if (fluxo.aguardando) return "aguardando";
  return "em_andamento";
}

/** Marco resolvido = concluído ou "não se aplica" (só `pendente` ainda impede a conclusão da obra). */
export const marcoResolvido = (status: string) => status === "concluido" || status === "nao_se_aplica";

/** Os 2 marcos fixos que toda obra tem (criados junto com ela em `garantir_obra`). */
export const MARCOS_OBRA = ["nf_cliente", "garantia"] as const;

/**
 * Situação geral: cancelada > pausada > concluída > em andamento.
 * Concluída exige os 3 setores no status final e os 2 marcos fixos presentes e resolvidos
 * (marco ausente nunca conta como resolvido).
 */
export function situacaoObra(entrada: {
  canceladaEm: string | null;
  pausadaEm: string | null;
  fluxos: readonly { setor: SetorObra; status: string | null }[];
  marcos: readonly { marco: string; status: string }[];
}): SituacaoObra {
  if (entrada.canceladaEm) return "cancelada";
  if (entrada.pausadaEm) return "pausada";
  const tresSetoresConcluidos = (["compras", "engenharia", "operacional"] as const).every((setor) =>
    entrada.fluxos.some((f) => f.setor === setor && setorConcluido(setor, f.status)),
  );
  const marcosResolvidos = MARCOS_OBRA.every((marco) => entrada.marcos.some((m) => m.marco === marco && marcoResolvido(m.status)));
  if (tresSetoresConcluidos && marcosResolvidos) return "concluida";
  return "em_andamento";
}

/** Alertas factuais. `parado`/`aguardando` seguem o estado exibido (setor concluído não alerta). */
export function alertasObra(entrada: {
  alertaPagamentoEstornadoEm: string | null;
  vendaAlteradaEm: string | null;
  estadosSetores: readonly EstadoSetor[];
}): AlertaObra[] {
  const alertas: AlertaObra[] = [];
  if (entrada.alertaPagamentoEstornadoEm) alertas.push("estorno");
  if (entrada.vendaAlteradaEm) alertas.push("venda_alterada");
  if (entrada.estadosSetores.includes("parado")) alertas.push("parado");
  if (entrada.estadosSetores.includes("aguardando")) alertas.push("aguardando");
  return alertas;
}

// --- Filtros -----------------------------------------------------------------

/** Minúsculas e sem acento, para a busca por nome. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type FiltrosObras = {
  /** Número da obra (com ou sem "#") ou parte do nome do cliente. */
  busca?: string;
  situacao?: SituacaoObra;
  alerta?: AlertaObra;
  /** Com `estado`: só obras em que esse setor está nesse estado. Sem `estado`, não filtra. */
  setor?: SetorObra;
  /** Sem `setor`: obras em que qualquer setor está nesse estado. */
  estado?: EstadoSetor;
};

type ObraFiltravel = {
  numero: number;
  clienteNome: string;
  situacao: SituacaoObra;
  alertas: readonly AlertaObra[];
  setores: readonly { setor: SetorObra; estado: EstadoSetor }[];
};

/** Filtra os view models já carregados (aplicado no servidor, depois de `carregarObras`). */
export function filtrarObras<T extends ObraFiltravel>(obras: readonly T[], filtros: FiltrosObras): T[] {
  const termo = normalizarBusca(filtros.busca ?? "").replace(/^#/, "");
  return obras.filter((o) => {
    if (termo && !String(o.numero).includes(termo) && !normalizarBusca(o.clienteNome).includes(termo)) return false;
    if (filtros.situacao && o.situacao !== filtros.situacao) return false;
    if (filtros.alerta && !o.alertas.includes(filtros.alerta)) return false;
    if (filtros.estado) {
      const setores = filtros.setor ? o.setores.filter((s) => s.setor === filtros.setor) : o.setores;
      if (!setores.some((s) => s.estado === filtros.estado)) return false;
    }
    return true;
  });
}
