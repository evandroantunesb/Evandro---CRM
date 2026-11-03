import { ROTULO_PRAZO, type PrazoObra } from "@/lib/engenharia-prazos-regras";
import type { ObraNaEngenharia } from "@/lib/engenharia-regras";
import type { TarefaSetorVM } from "@/lib/tarefas-setor-regras";

/**
 * Início do engenheiro (desenho aprovado em 03/11/2026): o "Meu dia" por urgência, a agenda de prazos e o resumo da
 * faixa. Só junta fatos que a tela já carrega (obras com ação, tarefas, obras novas, pedidos de justificativa e os
 * prazos da Engenharia em dias úteis); nada de prazo inventado: o que não tem prazo vai para "Esta semana".
 */

export type TomItem = "negativo" | "atencao" | "neutro";
export type GrupoMeuDia = "atrasado" | "hoje" | "semana";

export type ItemMeuDia = {
  chave: string;
  tipo: "obra" | "tarefa" | "nova" | "justificativa";
  titulo: string;
  detalhe: string;
  href: string;
  selo: { texto: string; tom: TomItem };
  /** Obra nova: o item traz "Iniciar atuação". */
  obraId?: string;
};

export type MeuDia = Record<GrupoMeuDia, ItemMeuDia[]> & {
  total: number;
  /** Obras novas da fila além das mostradas (as que esperam há mais tempo vêm primeiro). */
  maisNaFila: number;
};

/** Quantas obras novas da fila entram no "Meu dia"; o resto vira "e mais N" (a faixa inicia a próxima). */
export const NOVAS_NO_DIA = 3;

/** Pedido de justificativa de atraso ainda sem resposta, já com a obra e a etapa em texto. */
export type JustificativaPendente = { id: string; obraId: string; obra: string; etapa: string; prazo: string };

const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** "2026-11-06" → "sex, 06/11", sem passar por fuso horário. */
export function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const semana = DIA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

const nomeObra = (o: Pick<ObraNaEngenharia, "numero" | "clienteNome">) => `Obra #${o.numero} · ${o.clienteNome}`;

/** Grupo e selo pela data (YYYY-MM-DD) comparada a hoje. */
function porData(data: string, hoje: string, venceHoje = "Vence hoje"): { grupo: GrupoMeuDia; selo: ItemMeuDia["selo"] } {
  const dia = data.slice(0, 10);
  if (dia < hoje) return { grupo: "atrasado", selo: { texto: `Venceu ${dataCurta(dia)}`, tom: "negativo" } };
  if (dia === hoje) return { grupo: "hoje", selo: { texto: venceHoje, tom: "atencao" } };
  return { grupo: "semana", selo: { texto: `Até ${dataCurta(dia)}`, tom: "neutro" } };
}

/** Grupo da obra pelo prazo mais urgente (dias úteis do banco); sem prazo, "Esta semana". */
function porPrazo(prazos: readonly PrazoObra[]): { grupo: GrupoMeuDia; selo: ItemMeuDia["selo"] } {
  const p = prazos[0];
  if (!p) return { grupo: "semana", selo: { texto: "Sem prazo definido", tom: "neutro" } };
  if (p.diasRestantes < 0) return { grupo: "atrasado", selo: { texto: `Venceu ${dataCurta(p.limite)}`, tom: "negativo" } };
  if (p.diasRestantes === 0) return { grupo: "hoje", selo: { texto: "Vence hoje", tom: "atencao" } };
  return { grupo: "semana", selo: { texto: `Até ${dataCurta(p.limite)}`, tom: "neutro" } };
}

export function montarMeuDia({
  acoes,
  tarefas,
  novas,
  justificativas,
  prazos,
  hoje,
}: {
  /** Obras em que a próxima ação é minha (montarCentralEngenharia). */
  acoes: readonly ObraNaEngenharia[];
  /** Tarefas comigo e as da fila que eu posso assumir. */
  tarefas: readonly TarefaSetorVM[];
  /** Obras novas da fila, para quem pode iniciar. */
  novas: readonly ObraNaEngenharia[];
  justificativas: readonly JustificativaPendente[];
  /** Prazos da Engenharia por obra, mais urgente primeiro. */
  prazos: ReadonlyMap<string, readonly PrazoObra[]>;
  hoje: string;
}): MeuDia {
  const dia: MeuDia = { atrasado: [], hoje: [], semana: [], total: 0, maisNaFila: Math.max(0, novas.length - NOVAS_NO_DIA) };
  const por = (grupo: GrupoMeuDia, item: ItemMeuDia) => dia[grupo].push(item);

  for (const j of justificativas) {
    const { grupo, selo } = porData(j.prazo, hoje, "Responder até hoje");
    por(grupo, { chave: `j-${j.id}`, tipo: "justificativa", titulo: `Justificar atraso · ${j.etapa}`, detalhe: j.obra, href: `/obras/${j.obraId}#atrasos`, selo });
  }
  for (const t of tarefas) {
    const { grupo, selo } = t.atrasada ? { grupo: "atrasado" as const, selo: { texto: `Venceu ${dataCurta(t.prazo)}`, tom: "negativo" as const } } : porData(t.prazo, hoje);
    const origem = t.responsavel ? (t.pedidoPor ? `Pedida por ${t.pedidoPor}` : "Tarefa") : "Na fila do setor";
    por(grupo, { chave: `t-${t.id}`, tipo: "tarefa", titulo: t.titulo, detalhe: [origem, t.referencia.rotulo].filter(Boolean).join(" · "), href: t.referencia.href ?? "/engenharia?ver=minhas", selo });
  }
  for (const o of acoes) {
    const { grupo, selo } = porPrazo(prazos.get(o.id) ?? []);
    por(grupo, { chave: `o-${o.id}`, tipo: "obra", titulo: o.proximaAcao ?? o.statusRotulo, detalhe: `${nomeObra(o)} · ${o.statusRotulo}`, href: `/engenharia/${o.id}`, selo });
  }
  // Obra nova na fila: entra hoje, com o botão de iniciar; só as que esperam há mais tempo.
  for (const o of novas.slice(0, NOVAS_NO_DIA)) {
    por("hoje", {
      chave: `n-${o.id}`,
      tipo: "nova",
      titulo: "Obra nova na fila",
      detalhe: `${nomeObra(o)} · ${o.cidadeUf}${o.potenciaKwp == null ? "" : ` · ${o.potenciaKwp.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kWp`}`,
      href: `/engenharia/${o.id}`,
      selo: { texto: "Na fila", tom: "neutro" },
      obraId: o.id,
    });
  }
  dia.total = dia.atrasado.length + dia.hoje.length + dia.semana.length + dia.maisNaFila;
  return dia;
}

export type DiaAgenda = { data: string; itens: { chave: string; rotulo: string; obra: string; href: string; diasRestantes: number }[] };

/**
 * Próximos prazos: os da Engenharia (em dias úteis) que vencem de hoje até `dias` dias úteis à frente, agrupados por
 * data. Os vencidos ficam no "Meu dia" (Atrasado), não aqui.
 */
export function agendaPrazos(obras: readonly ObraNaEngenharia[], prazos: ReadonlyMap<string, readonly PrazoObra[]>, dias = 7): DiaAgenda[] {
  const porDia = new Map<string, DiaAgenda["itens"]>();
  for (const o of obras) {
    for (const p of prazos.get(o.id) ?? []) {
      if (p.diasRestantes < 0 || p.diasRestantes > dias) continue;
      const lista = porDia.get(p.limite) ?? [];
      lista.push({ chave: `${o.id}-${p.chave}`, rotulo: ROTULO_PRAZO[p.chave], obra: nomeObra(o), href: `/engenharia/${o.id}`, diasRestantes: p.diasRestantes });
      porDia.set(p.limite, lista);
    }
  }
  return [...porDia]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, itens]) => ({ data, itens: itens.sort((a, b) => a.obra.localeCompare(b.obra)) }));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Resumo da faixa: só as partes com algo a dizer; sem nada pendente, uma frase calma. */
export function resumoFaixa(partes: { acoes: number; vencemAmanha?: number; vencidos?: number; novas: number }, pessoal: boolean) {
  const textos = [
    partes.acoes > 0 && (pessoal ? `${plural(partes.acoes, "obra pede", "obras pedem")} sua ação` : `${plural(partes.acoes, "obra pede", "obras pedem")} ação`),
    (partes.vencidos ?? 0) > 0 && plural(partes.vencidos!, "prazo vencido", "prazos vencidos"),
    (partes.vencemAmanha ?? 0) > 0 && `${plural(partes.vencemAmanha!, "prazo vence", "prazos vencem")} no próximo dia útil`,
    partes.novas > 0 && `${plural(partes.novas, "obra nova", "obras novas")} na fila`,
  ].filter(Boolean);
  return textos.length ? `${textos.join(" · ")}.` : pessoal ? "Nada pendente com você agora." : "Nada pendente no setor agora.";
}

/** Contagem por responsável principal das obras em curso (carga da equipe), maior primeiro; sem responsável no fim. */
export function cargaPorResponsavel(obras: readonly ObraNaEngenharia[]) {
  const carga = new Map<string | null, number>();
  for (const o of obras) carga.set(o.principalNome, (carga.get(o.principalNome) ?? 0) + 1);
  return [...carga]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => (a.nome == null ? 1 : b.nome == null ? -1 : b.total - a.total || a.nome.localeCompare(b.nome)));
}
