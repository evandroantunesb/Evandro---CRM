import type { PeriodoIndicadores } from "@/lib/engenharia-prazos-regras";
import type { MetricaTrajetoria } from "@/lib/engenharia-trajetoria";
import type { FiltroTarefasSetor } from "@/lib/tarefas-setor-regras";

/** Escolhas da tela, todas na URL: visão (Pessoal/Equipe), carteira, período do Desempenho, aba das tarefas e métrica da trajetória. */
export type VisaoEngenharia = "pessoal" | "equipe";
export type VisaoCarteira = "resumo" | "kanban" | "lista";

// Sem "Pedidas por mim": a Engenharia vê o que é do setor, não o que pediu a outros.
export const FILTROS = ["abertas", "minhas", "fila", "concluidas"] as const satisfies readonly FiltroTarefasSetor[];
export type Filtro = (typeof FILTROS)[number];

export type EstadoEngenharia = {
  visao: VisaoEngenharia;
  /** Visão em que a pessoa abre (admin e gestor: Equipe; quem atua: Pessoal); fica fora da URL. */
  visaoPadrao: VisaoEngenharia;
  carteira: VisaoCarteira;
  periodo: PeriodoIndicadores;
  /** Período escolhido de propósito: mantém o Desempenho aberto. */
  periodoNaUrl: boolean;
  ver: Filtro;
  /** O que os gráficos da trajetória mostram: obras ou kWp. */
  metrica: MetricaTrajetoria;
};

export function lerCarteira(valor: unknown): VisaoCarteira {
  return valor === "kanban" || valor === "lista" ? valor : "resumo";
}

export function lerFiltro(valor: unknown): Filtro {
  return (FILTROS as readonly string[]).includes(valor as string) ? (valor as Filtro) : "abertas";
}

/** Link da tela com uma mudança, guardando as demais escolhas; os padrões ficam fora da URL. */
export function hrefEngenharia(estado: EstadoEngenharia, mudanca: Partial<Omit<EstadoEngenharia, "visaoPadrao">> = {}) {
  const e = { ...estado, ...mudanca };
  const q = new URLSearchParams();
  if (e.visao !== e.visaoPadrao) q.set("visao", e.visao);
  if (e.carteira !== "resumo") q.set("carteira", e.carteira);
  if (e.periodoNaUrl || e.periodo !== 30) q.set("periodo", String(e.periodo));
  if (e.ver !== "abertas") q.set("ver", e.ver);
  if (e.metrica !== "obras") q.set("trajetoria", e.metrica);
  return q.size ? `/engenharia?${q}` : "/engenharia";
}
