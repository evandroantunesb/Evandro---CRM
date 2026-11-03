import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { EtapaObra } from "./cronograma";
import { montarCustos, resultadoObra, type CustosObraVM } from "./custos";
import { carregarObras, lotes, TAMANHO_LOTE } from "./dados";
import { ordemSemaforo, prazosDaLinha, semaforoObra, type CorSemaforo } from "./semaforo";

/**
 * Visão Completa de Obras (OPR), do desenho aprovado "Obras — Completa": todas as obras que a pessoa vê, com o semáforo
 * de prazo e custo, os números do topo e os escalonamentos abertos. Só admin e gestor chegam aqui (a página decide);
 * a RLS continua sendo a barreira de cada leitura.
 */

export type ObraCompletaVM = {
  id: string;
  numero: number;
  clienteNome: string;
  potenciaKwp: number | null;
  venda: number | null;
  concluida: boolean;
  cor: CorSemaforo;
  /** Justificativa respondida do atraso, se houver; senão, o motivo calculado da regra. */
  motivo: string | null;
  etapaAtual: EtapaObra | null;
  progresso: number;
  entregaPrevista: string;
  atrasoEntrega: number;
  /** Realizado ÷ planejado, em %. */
  custoPct: number | null;
  /** Margem projetada (antes de impostos), em %. */
  margemPct: number | null;
};

export type EscalonamentoAbertoVM = {
  id: string;
  obraId: string;
  obraNumero: number;
  titulo: string;
  valor: number | null;
  abertoPor: string;
  abertoEm: string;
  cor: CorSemaforo;
};

export type KpisCompleta = {
  emExecucao: number;
  vermelhas: number;
  amarelas: number;
  verdes: number;
  escalonamentosAbertos: number;
  concluidasNoMes: number;
  valorEmExecucao: number;
  /** (venda − custo projetado) das obras em execução, em R$ e em % da venda. */
  margemProjetada: number;
  margemProjetadaPct: number | null;
  /** Soma do lucro líquido previsto das obras em execução. */
  margemLiquida: number;
  margemLiquidaPct: number | null;
};

export type CompletaVM = { obras: ObraCompletaVM[]; kpis: KpisCompleta; escalonamentos: EscalonamentoAbertoVM[] };

type Linha<T> = { data: T[] | null; error: unknown };
async function emLotes<T>(ids: string[], ler: (lote: string[]) => PromiseLike<Linha<T>>): Promise<T[]> {
  const respostas = await Promise.all(lotes(ids, TAMANHO_LOTE).map(ler));
  return respostas.flatMap((r) => {
    if (r.error) throw r.error;
    return r.data ?? [];
  });
}

const agrupar = <T extends { obra_id: string }>(linhas: readonly T[]) => {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) mapa.set(l.obra_id, [...(mapa.get(l.obra_id) ?? []), l]);
  return mapa;
};

export async function carregarCompleta(
  supabase: SupabaseServidor,
  entrada: { empresaId: string; papel: string | null | undefined; hoje: string },
): Promise<CompletaVM> {
  const { empresaId, papel, hoje } = entrada;
  const { obras: lista } = await carregarObras(supabase, { empresaId, papel, comResponsaveis: false });
  const ativas = lista.filter((o) => o.situacao !== "cancelada");
  const ids = ativas.map((o) => o.id);

  const [prazos, orcamento, custos, vendas, justificativas, escalonamentos, deducoes, identidades] = await Promise.all([
    emLotes(ids, (l) => supabase.rpc("prazos_obras", { p_obra_ids: l })),
    emLotes(ids, (l) => supabase.from("obra_orcamento").select("obra_id, categoria, planejado").in("obra_id", l)),
    emLotes(ids, (l) => supabase.from("obra_custos").select("obra_id, categoria, valor").in("obra_id", l)),
    emLotes(ids, (l) => supabase.from("obra_dados_comerciais").select("obra_id, valor_vendido").eq("empresa_id", empresaId).in("obra_id", l)),
    emLotes(ids, (l) =>
      supabase.from("obra_justificativas_atraso").select("obra_id, etapa, texto, respondido_em").not("respondido_em", "is", null).in("obra_id", l),
    ),
    supabase
      .from("obra_escalonamentos")
      .select("id, obra_id, titulo, valor, aberto_por, aberto_em")
      .eq("empresa_id", empresaId)
      .is("fechado_em", null)
      .order("aberto_em", { ascending: false }),
    supabase.from("obra_deducoes").select("impostos_percentual, comissoes_percentual").eq("empresa_id", empresaId).maybeSingle(),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
  ]);
  for (const r of [escalonamentos, deducoes, identidades]) if (r.error) throw r.error;

  const prazosPorObra = new Map(prazos.map((p) => [p.obra_id, prazosDaLinha(p)]));
  const orcamentoPorObra = agrupar(orcamento);
  const custosPorObra = agrupar(custos);
  const vendaPorObra = new Map(vendas.map((v) => [v.obra_id, Number(v.valor_vendido)]));
  // A justificativa mais recente de cada obra entra como motivo.
  const justificativaPorObra = new Map<string, string>();
  for (const j of [...justificativas].sort((a, b) => (a.respondido_em ?? "").localeCompare(b.respondido_em ?? ""))) {
    if (j.texto) justificativaPorObra.set(j.obra_id, j.texto);
  }
  const deducoesPct = Number(deducoes.data?.impostos_percentual ?? 0) + Number(deducoes.data?.comissoes_percentual ?? 0);

  type Calculo = { vm: ObraCompletaVM; custos: CustosObraVM | null; lucro: number | null };
  const calculos: Calculo[] = [];
  for (const o of ativas) {
    const p = prazosPorObra.get(o.id);
    if (!p) continue;
    const orc = orcamentoPorObra.get(o.id) ?? [];
    const montado = orc.length > 0 ? montarCustos({ orcamento: orc, lancamentos: custosPorObra.get(o.id) ?? [], etapasConcluidas: new Set(p.etapasConcluidas) }) : null;
    // Orçamento todo zerado e nada lançado = sem orçamento: nada de margem de 100% inventada.
    const c = montado && (montado.planejado > 0 || montado.realizado > 0) ? montado : null;
    const venda = vendaPorObra.get(o.id) ?? null;
    const resultado = c && venda != null ? resultadoObra(venda, c, deducoesPct) : null;
    const semaforo = semaforoObra({ prazos: p, custos: c, margemProjetadaPct: resultado?.margemProjetadaPct ?? null });
    calculos.push({
      custos: c,
      lucro: resultado?.lucro ?? null,
      vm: {
        id: o.id,
        numero: o.numero,
        clienteNome: o.clienteNome,
        potenciaKwp: o.potenciaKwp,
        venda,
        concluida: o.situacao === "concluida",
        cor: semaforo.cor,
        motivo: semaforo.cor === "verde" ? null : (justificativaPorObra.get(o.id) ?? semaforo.motivo),
        etapaAtual: p.etapaAtual,
        progresso: p.progresso,
        entregaPrevista: p.entregaPrevista,
        atrasoEntrega: p.atrasoEntrega,
        custoPct: c?.realizadoPct ?? null,
        margemPct: resultado?.margemProjetadaPct ?? null,
      },
    });
  }
  calculos.sort((a, b) => ordemSemaforo(a.vm, b.vm));

  const execucao = calculos.filter((c) => !c.vm.concluida);
  const soma = (f: (c: Calculo) => number) => execucao.reduce((t, c) => t + f(c), 0);
  const valorEmExecucao = soma((c) => c.vm.venda ?? 0);
  // Margens: só as obras com orçamento e venda, sobre a venda delas.
  const vendaComOrcamento = soma((c) => (c.vm.venda != null && c.custos ? c.vm.venda : 0));
  const margemProjetada = soma((c) => (c.vm.venda != null && c.custos ? c.vm.venda - c.custos.projetado : 0));
  const margemLiquida = soma((c) => c.lucro ?? 0);
  const pct = (v: number) => (vendaComOrcamento > 0 ? (v / vendaComOrcamento) * 100 : null);
  const mes = hoje.slice(0, 7);
  const porCor = (cor: CorSemaforo) => execucao.filter((c) => c.vm.cor === cor).length;

  const nomes = new Map((identidades.data ?? []).map((m) => [m.membro_id, m.nome]));
  const corPorObra = new Map(calculos.map((c) => [c.vm.id, c.vm]));
  const abertos: EscalonamentoAbertoVM[] = (escalonamentos.data ?? []).flatMap((e) => {
    const obra = corPorObra.get(e.obra_id);
    if (!obra) return [];
    return [
      {
        id: e.id,
        obraId: e.obra_id,
        obraNumero: obra.numero,
        titulo: e.titulo,
        valor: e.valor == null ? null : Number(e.valor),
        abertoPor: (e.aberto_por && nomes.get(e.aberto_por)) || "Usuário não identificado",
        abertoEm: e.aberto_em,
        cor: obra.cor,
      },
    ];
  });

  return {
    obras: calculos.map((c) => c.vm),
    escalonamentos: abertos,
    kpis: {
      emExecucao: execucao.length,
      vermelhas: porCor("vermelha"),
      amarelas: porCor("amarela"),
      verdes: porCor("verde"),
      escalonamentosAbertos: abertos.length,
      concluidasNoMes: calculos.filter((c) => c.vm.concluida && prazosPorObra.get(c.vm.id)?.concluidaEm?.startsWith(mes)).length,
      valorEmExecucao,
      margemProjetada,
      margemProjetadaPct: pct(margemProjetada),
      margemLiquida,
      margemLiquidaPct: pct(margemLiquida),
    },
  };
}
