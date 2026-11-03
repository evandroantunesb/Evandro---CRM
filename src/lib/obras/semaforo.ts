import { ETAPAS_OBRA, ROTULO_ETAPA_CURTO, type EtapaObra } from "./cronograma";
import { normalizarBusca } from "./derivados";
import type { CustosObraVM } from "./custos";

/**
 * Semáforo da obra (OPR), pelas regras do desenho aprovado "Obras — Completa" ("Como o semáforo decide"):
 *  - VERMELHA: entrega prevista mais de 5 dias úteis depois da contratada, ou margem projetada negativa;
 *  - AMARELA: custo de uma categoria ainda em andamento a partir de 90% do planejado; prazo de etapa ou da entrega
 *    vencendo em até 3 dias úteis; ou algum atraso (de etapa ou da entrega, até 5 dias úteis);
 *  - VERDE: o resto. Vale a pior cor.
 * Os dias úteis vêm prontos do banco (`prazos_obras`); aqui só se aplicam as regras e o motivo exibido.
 */

export const CORES_SEMAFORO = ["vermelha", "amarela", "verde"] as const;
export type CorSemaforo = (typeof CORES_SEMAFORO)[number];

export const ROTULO_COR: Record<CorSemaforo, string> = { vermelha: "Vermelha", amarela: "Amarela", verde: "Verde" };

export const LIMITE_CUSTO_PCT = 90;
export const LIMITE_VENCENDO_DIAS = 3;
export const LIMITE_ATRASO_DIAS = 5;

export type PrazosObra = {
  etapaAtual: EtapaObra | null;
  entregaContratada: string;
  entregaPrevista: string;
  /** Dias úteis da entrega prevista depois da contratada (0 = no prazo). */
  atrasoEntrega: number;
  maiorAtraso: number;
  maiorAtrasoEtapa: EtapaObra | null;
  /** Dias úteis até o prazo mais próximo ainda não vencido; null sem prazo à frente. */
  venceEm: number | null;
  /** Etapa desse prazo; null = a entrega contratada. */
  venceEtapa: EtapaObra | null;
  progresso: number;
  etapasConcluidas: EtapaObra[];
  concluidaEm: string | null;
};

type LinhaPrazos = {
  etapa_atual: string | null;
  entrega_contratada: string;
  entrega_prevista: string;
  atraso_entrega: number;
  maior_atraso: number;
  maior_atraso_etapa: string | null;
  vence_em: number | null;
  vence_etapa: string | null;
  progresso: number;
  etapas_concluidas: string[] | null;
  concluida_em: string | null;
};

const etapa = (v: string | null): EtapaObra | null => (v && (ETAPAS_OBRA as readonly string[]).includes(v) ? (v as EtapaObra) : null);

export function prazosDaLinha(l: LinhaPrazos): PrazosObra {
  return {
    etapaAtual: etapa(l.etapa_atual),
    entregaContratada: l.entrega_contratada,
    entregaPrevista: l.entrega_prevista,
    atrasoEntrega: l.atraso_entrega ?? 0,
    maiorAtraso: l.maior_atraso ?? 0,
    maiorAtrasoEtapa: etapa(l.maior_atraso_etapa),
    venceEm: l.vence_em,
    venceEtapa: etapa(l.vence_etapa),
    progresso: l.progresso ?? 0,
    etapasConcluidas: (l.etapas_concluidas ?? []).map(etapa).filter((e): e is EtapaObra => e !== null),
    concluidaEm: l.concluida_em,
  };
}

const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
const nomeEtapa = (e: EtapaObra) => ROTULO_ETAPA_CURTO[e].toLowerCase();

export type SemaforoVM = { cor: CorSemaforo; motivo: string | null };

/**
 * Cor e motivo calculado (o da regra mais grave). `custos` e `margemProjetadaPct` só chegam a quem vê os valores;
 * sem eles, valem as regras de prazo.
 */
export function semaforoObra(entrada: { prazos: PrazosObra; custos: CustosObraVM | null; margemProjetadaPct: number | null }): SemaforoVM {
  const { prazos: p, custos, margemProjetadaPct: margem } = entrada;

  if (p.atrasoEntrega > LIMITE_ATRASO_DIAS) return { cor: "vermelha", motivo: "Entrega prevista após o contratado" };
  if (margem != null && margem < 0) {
    const acima = custos?.categorias.find((c) => c.acima);
    return { cor: "vermelha", motivo: acima ? `Custo de ${acima.nome.toLowerCase()} acima do planejado` : "Margem projetada negativa" };
  }

  if (p.atrasoEntrega > 0) return { cor: "amarela", motivo: `Entrega prevista ${dias(p.atrasoEntrega)} após o contratado` };
  if (p.maiorAtraso > 0 && p.maiorAtrasoEtapa) return { cor: "amarela", motivo: `Atraso de ${dias(p.maiorAtraso)} em ${nomeEtapa(p.maiorAtrasoEtapa)}` };
  const perto = custos?.categorias.find((c) => !c.encerrada && c.planejado > 0 && (c.realizado / c.planejado) * 100 >= LIMITE_CUSTO_PCT);
  if (perto) return { cor: "amarela", motivo: `Custo de ${perto.nome.toLowerCase()} perto do limite` };
  if (p.venceEm != null && p.venceEm <= LIMITE_VENCENDO_DIAS) {
    const quando = p.venceEm === 0 ? "vence hoje" : `vence em ${dias(p.venceEm)}`;
    return { cor: "amarela", motivo: p.venceEtapa ? `Prazo de ${nomeEtapa(p.venceEtapa)} ${quando}` : `Entrega contratada ${quando}` };
  }
  return { cor: "verde", motivo: null };
}

const PESO: Record<CorSemaforo, number> = { vermelha: 0, amarela: 1, verde: 2 };

/** Ordem da Completa: vermelhas primeiro, depois amarelas e verdes; dentro da cor, a obra mais nova primeiro. */
export const ordemSemaforo = (a: { cor: CorSemaforo; numero: number }, b: { cor: CorSemaforo; numero: number }) =>
  PESO[a.cor] - PESO[b.cor] || b.numero - a.numero;

/** Filtros da Completa, na URL: `cor` (uma cor ou "concluidas") e `q` (cliente ou nº). Sem cor = em execução. */
export const FILTROS_COR = [...CORES_SEMAFORO, "concluidas"] as const;
export type FiltroCor = (typeof FILTROS_COR)[number];
export type FiltrosCompleta = { cor?: FiltroCor; busca?: string };

export function filtrosCompletaDeParams(params: Record<string, string | string[] | undefined>): FiltrosCompleta {
  const cor = typeof params.cor === "string" ? FILTROS_COR.find((c) => c === params.cor) : undefined;
  const busca = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  return { cor, busca: busca || undefined };
}

export function queryCompleta(f: FiltrosCompleta): string {
  const p = new URLSearchParams();
  if (f.busca) p.set("q", f.busca);
  if (f.cor) p.set("cor", f.cor);
  return p.toString();
}

export function filtrarCompleta<T extends { numero: number; clienteNome: string; concluida: boolean; cor: CorSemaforo }>(obras: readonly T[], f: FiltrosCompleta): T[] {
  const termo = normalizarBusca(f.busca ?? "").replace(/^#/, "");
  return obras.filter((o) => {
    if (f.cor === "concluidas" ? !o.concluida : o.concluida || (f.cor && o.cor !== f.cor)) return false;
    return !termo || String(o.numero).includes(termo) || normalizarBusca(o.clienteNome).includes(termo);
  });
}

/** Valor de `?visao=` que leva admin e gestor à lista por setor (a mesma dos demais papéis). */
export const VISAO_SETORES = "setores";

/**
 * Admin e gestor (`podeCompleta`) usam a visão Completa, salvo quando a URL pede a lista por setor (`?visao=setores`)
 * ou traz um filtro dela (como na volta da ficha): aí valem a lista, a ordem e os filtros de sempre.
 */
export function usaVisaoCompleta(podeCompleta: boolean, params: Record<string, string | string[] | undefined>): boolean {
  if (!podeCompleta || params.visao === VISAO_SETORES) return false;
  return !["situacao", "alerta", "setor", "estado"].some((k) => typeof params[k] === "string");
}
