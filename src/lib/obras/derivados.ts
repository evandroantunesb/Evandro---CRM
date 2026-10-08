/**
 * Estados derivados de Obras. Módulo puro (sem Supabase): só fatos registrados, sem
 * percentual de progresso, sem SLA e sem semáforo por tempo.
 */
import {
  SETORES_OPERACIONAIS,
  STATUS_FINAL,
  STATUS_INICIAL,
  type SetorOperacional,
} from "./rotulos";

export type FluxoEstado = { status: string; parado: boolean; aguardando: string | null };

export type EstadoSetor =
  | "indisponivel"
  | "concluido"
  | "parado"
  | "aguardando"
  | "nao_iniciado"
  | "em_andamento";

/**
 * Precedência: indisponível (fluxo ausente) > parado > aguardando > concluído > não
 * iniciado > em andamento. Fluxo ausente é inconsistência de dados: nenhum status é
 * inventado. Parado e aguardando são fatos que bloqueiam e precisam ficar visíveis mesmo
 * que o status já esteja no fim do fluxo.
 */
export function estadoSetor(setor: SetorOperacional, fluxo: FluxoEstado | null): EstadoSetor {
  if (!fluxo) return "indisponivel";
  if (fluxo.parado) return "parado";
  if (fluxo.aguardando != null) return "aguardando";
  if (fluxo.status === STATUS_FINAL[setor]) return "concluido";
  if (fluxo.status === STATUS_INICIAL[setor]) return "nao_iniciado";
  return "em_andamento";
}

export const ROTULO_ESTADO_SETOR: Record<EstadoSetor, string> = {
  indisponivel: "Indisponível",
  concluido: "Concluído",
  parado: "Parado",
  aguardando: "Aguardando",
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
};

export type ObraEstado = {
  pausada: boolean;
  cancelada: boolean;
  alertaEstorno: boolean;
  vendaAlterada: boolean;
  /** `null` = fluxo ausente. */
  setores: Record<SetorOperacional, FluxoEstado | null>;
};

export type EstadoObra =
  | "cancelada"
  | "pausada"
  | "estorno"
  | "venda_alterada"
  | "fluxo_ausente"
  | "parado"
  | "aguardando"
  | "concluida";

export const ROTULO_ESTADO_OBRA: Record<EstadoObra, string> = {
  cancelada: "Cancelada",
  pausada: "Pausada",
  estorno: "Pagamento estornado",
  venda_alterada: "Venda alterada",
  fluxo_ausente: "Fluxo ausente",
  parado: "Setor parado",
  aguardando: "Aguardando terceiro",
  concluida: "Concluída",
};

export function estadosSetores(
  obra: Pick<ObraEstado, "setores">,
): Record<SetorOperacional, EstadoSetor> {
  return Object.fromEntries(
    SETORES_OPERACIONAIS.map((s) => [s, estadoSetor(s, obra.setores[s])]),
  ) as Record<SetorOperacional, EstadoSetor>;
}

/** Os três setores com status final e sem bloqueio (parado/aguardando) registrado. */
export function obraConcluida(obra: Pick<ObraEstado, "setores">): boolean {
  const e = estadosSetores(obra);
  return SETORES_OPERACIONAIS.every((s) => e[s] === "concluido");
}

export function estadosObra(obra: ObraEstado): EstadoObra[] {
  const e = estadosSetores(obra);
  const lista: EstadoObra[] = [];
  if (obra.cancelada) lista.push("cancelada");
  if (obra.pausada) lista.push("pausada");
  if (obra.alertaEstorno) lista.push("estorno");
  if (obra.vendaAlterada) lista.push("venda_alterada");
  if (SETORES_OPERACIONAIS.some((s) => e[s] === "indisponivel")) lista.push("fluxo_ausente");
  if (SETORES_OPERACIONAIS.some((s) => e[s] === "parado")) lista.push("parado");
  if (SETORES_OPERACIONAIS.some((s) => e[s] === "aguardando")) lista.push("aguardando");
  if (SETORES_OPERACIONAIS.every((s) => e[s] === "concluido")) lista.push("concluida");
  return lista;
}

/** Alertas factuais: estorno, venda alterada ou fluxo ausente (inconsistência de dados). */
export function temAlerta(obra: ObraEstado): boolean {
  return (
    obra.alertaEstorno ||
    obra.vendaAlterada ||
    SETORES_OPERACIONAIS.some((s) => obra.setores[s] == null)
  );
}

export type Kpis = {
  total: number;
  emAndamento: number;
  comSetorParado: number;
  comSetorAguardando: number;
  concluidas: number;
  pausadas: number;
  canceladas: number;
  comAlerta: number;
};

/**
 * Contagens simples (sem percentuais). Em andamento = não cancelada e não concluída.
 * Com alerta = estorno, venda alterada ou fluxo ausente.
 */
export function kpis(lista: readonly ObraEstado[]): Kpis {
  const k: Kpis = {
    total: lista.length,
    emAndamento: 0,
    comSetorParado: 0,
    comSetorAguardando: 0,
    concluidas: 0,
    pausadas: 0,
    canceladas: 0,
    comAlerta: 0,
  };
  for (const obra of lista) {
    const estados = estadosObra(obra);
    const concluida = estados.includes("concluida");
    if (!obra.cancelada && !concluida) k.emAndamento++;
    if (estados.includes("parado")) k.comSetorParado++;
    if (estados.includes("aguardando")) k.comSetorAguardando++;
    if (concluida) k.concluidas++;
    if (obra.pausada) k.pausadas++;
    if (obra.cancelada) k.canceladas++;
    if (temAlerta(obra)) k.comAlerta++;
  }
  return k;
}

export type FiltroEstadoObra = "todas" | "pausada" | "cancelada" | "alerta";

export type Filtros = {
  busca?: string;
  setor?: SetorOperacional | "todos";
  /** Estado do setor escolhido (exige `setor` diferente de "todos"; sem setor, vale para qualquer um dos três). */
  estadoSetor?: EstadoSetor | "todos";
  estadoObra?: FiltroEstadoObra;
};

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export type ObraFiltravel = ObraEstado & {
  numero: number;
  clienteNome: string;
  cidade: string | null;
};

export function filtrar<T extends ObraFiltravel>(lista: readonly T[], f: Filtros): T[] {
  const termo = normalizar(f.busca ?? "");
  const setor = f.setor ?? "todos";
  const estado = f.estadoSetor ?? "todos";
  return lista.filter((obra) => {
    if (termo) {
      const alvo = normalizar(`${obra.numero} ${obra.clienteNome} ${obra.cidade ?? ""}`);
      if (!alvo.includes(termo)) return false;
    }
    if (setor !== "todos" || estado !== "todos") {
      const e = estadosSetores(obra);
      const setores = setor === "todos" ? SETORES_OPERACIONAIS : [setor];
      if (!setores.some((s) => estado === "todos" || e[s] === estado)) return false;
    }
    switch (f.estadoObra ?? "todas") {
      case "pausada":
        return obra.pausada;
      case "cancelada":
        return obra.cancelada;
      case "alerta":
        return temAlerta(obra);
      default:
        return true;
    }
  });
}
