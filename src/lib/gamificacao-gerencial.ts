import "server-only";
import { inicioDaSemana } from "@/lib/formatacao";
import { calcularProgresso, calcularRealizado, type Meta, type ProgressoMeta } from "@/lib/metas";
import type { Vinculo } from "@/lib/sessao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { MetricaMeta, PerfilGamificacao } from "@/lib/tipos";

/**
 * Dashboard GERENCIAL da Gamificação (admin = empresa inteira; gestor = só o
 * escopo dele). Só leitura: usa a RPC `ranking_gamificacao` e SELECTs já
 * cobertos por RLS — nenhuma mudança de banco. Ver decisões de produto em
 * `docs/` / PR da feature.
 */

/**
 * Perfis que entram no ranking gerencial, na ordem de exibição. Para incluir
 * `cs_farmer` no futuro basta acrescentar aqui (a UI renderiza um ranking por
 * item desta lista).
 */
export const PERFIS_RANKING_GERENCIAL = [
  "closer",
  "sdr",
] as const satisfies readonly PerfilGamificacao[];
export type PerfilRankingGerencial = (typeof PERFIS_RANKING_GERENCIAL)[number];

export type RankingLinha = { posicao: number; membroId: string; nome: string; total: number };
type LinhaBrutaRanking = { membro_id: string; total_xp: number };

// ---------------------------------------------------------------------------
// Funções puras (testadas em tests/gamificacao-gerencial.test.ts)
// ---------------------------------------------------------------------------

/** Mantém só as linhas do escopo. `escopo` nulo = sem filtro (admin). */
export function filtrarPorEscopo<T extends { membro_id: string }>(
  linhas: readonly T[] | null | undefined,
  escopo: ReadonlySet<string> | null,
): T[] {
  const todas = linhas ?? [];
  return escopo ? todas.filter((l) => escopo.has(l.membro_id)) : [...todas];
}

/** Soma o XP das linhas COMPLETAS (antes de qualquer corte de top N). */
export function somarXp(linhas: readonly LinhaBrutaRanking[]): number {
  return linhas.reduce((s, l) => s + l.total_xp, 0);
}

/** Membros distintos com XP > 0, somando todos os perfis (sem duplicar quem aparece em dois). */
export function contarParticipantes(grupos: readonly (readonly LinhaBrutaRanking[])[]): number {
  const ids = new Set<string>();
  for (const g of grupos) for (const l of g) if (l.total_xp > 0) ids.add(l.membro_id);
  return ids.size;
}

/** Variação % vs. período anterior. Sem baseline real (anterior = 0), não inventa uma %. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/** Ordena por XP (desc), numera e descarta quem não tem nome conhecido. Lista completa, sem corte. */
export function construirRankingCompleto(
  bruto: readonly LinhaBrutaRanking[],
  nomeMembro: ReadonlyMap<string, string>,
): RankingLinha[] {
  return bruto
    .filter((l) => nomeMembro.has(l.membro_id))
    .sort((a, b) => b.total_xp - a.total_xp)
    .map((l, i) => ({
      posicao: i + 1,
      membroId: l.membro_id,
      nome: nomeMembro.get(l.membro_id)!,
      total: l.total_xp,
    }));
}

/**
 * Escopo do gestor — mesma regra de `pode_ver_responsavel()`: ele mesmo + quem
 * está em equipes ATIVAS nas quais ele é `e_gestor`. `vinculos` são as linhas de
 * `equipe_membros` (já restritas às equipes ativas da empresa).
 */
export function calcularEscopoGestor(
  gestorId: string,
  vinculos: readonly { equipe_id: string; membro_id: string; e_gestor: boolean }[],
): Set<string> {
  const minhasEquipes = new Set(
    vinculos.filter((v) => v.membro_id === gestorId && v.e_gestor).map((v) => v.equipe_id),
  );
  const escopo = new Set<string>([gestorId]);
  for (const v of vinculos) if (minhasEquipes.has(v.equipe_id)) escopo.add(v.membro_id);
  return escopo;
}

// ---------------------------------------------------------------------------
// Escopo (consulta)
// ---------------------------------------------------------------------------

/**
 * Conjunto de `membro_id` visíveis ao usuário no dashboard gerencial.
 * admin -> null (sem filtro); gestor -> Set via equipes/equipe_membros
 * (ambas legíveis por membros ativos da empresa, policies "ver equipes da
 * empresa" / "ver composição das equipes").
 */
export async function obterEscopoMembros(
  supabase: SupabaseServidor,
  atual: Pick<Vinculo, "membroId" | "empresaId" | "papel">,
): Promise<Set<string> | null> {
  if (atual.papel === "admin") return null;
  const { data, error } = await supabase
    .from("equipe_membros")
    .select("equipe_id, membro_id, e_gestor, equipes!inner(ativa)")
    .eq("empresa_id", atual.empresaId)
    .eq("equipes.ativa", true);
  if (error) throw error;
  return calcularEscopoGestor(atual.membroId, data ?? []);
}

// ---------------------------------------------------------------------------
// Dados do dashboard
// ---------------------------------------------------------------------------

export type RankingGerencial = {
  perfil: PerfilRankingGerencial;
  semana: RankingLinha[];
  mes: RankingLinha[];
  geral: RankingLinha[];
};

export type MetaGerencial = {
  id: string;
  titulo: string;
  metrica: MetricaMeta;
  membroNome: string;
  valorAlvo: number;
  progresso: ProgressoMeta;
};

export type AtividadeGerencial = {
  id: string;
  membroNome: string;
  descricao: string;
  xp: number;
  moedas: number;
  createdAt: string;
};

export type ConquistaRecenteGerencial = {
  id: string;
  membroNome: string;
  conquistaNome: string;
  icone: string | null;
  desbloqueadaEm: string;
};

export type DadosGerencial = {
  /** "empresa" = admin; "equipe" = gestor. */
  escopo: "empresa" | "equipe";
  /** Gestor sem nenhuma equipe ativa sob sua gestão (escopo = só ele, que não pontua). */
  gestorSemEquipe: boolean;
  xpDistribuido: number;
  variacaoXpPct: number | null;
  participantes: number;
  metasAtingidas: number;
  metasTotal: number;
  conquistasPeriodo: number;
  rankings: RankingGerencial[];
  metas: MetaGerencial[];
  atividade: AtividadeGerencial[];
  conquistasRecentes: ConquistaRecenteGerencial[];
};

function limitesMes(deslocamento: number) {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = agora.getUTCMonth();
  const inicio = new Date(Date.UTC(ano, mes - deslocamento, 1));
  const fimExclusivo = new Date(Date.UTC(ano, mes - deslocamento + 1, 1));
  return {
    inicio,
    fimExclusivo,
    inicioIso: inicio.toISOString(),
    fimExclusivoIso: fimExclusivo.toISOString(),
  };
}

function paraDataCurta(d: Date) {
  return d.toISOString().slice(0, 10);
}

const LIMITE_ATIVIDADE = 8;
const LIMITE_CONQUISTAS_RECENTES = 6;

/**
 * Carrega tudo da visão gerencial. `deslocamento` = 0 (este mês) ou 1 (mês passado),
 * mesmo critério da visão pessoal.
 *
 * Consultas (todas com `empresa_id` da sessão; admin sem filtro de membro, gestor
 * filtrado pelo escopo além da RLS `pode_ver_responsavel`):
 * - `ranking_gamificacao` por perfil: semana, período (mês) e geral, + janela do mês
 *   anterior (variação do KPI de XP). A RPC devolve a empresa inteira (security
 *   definer), então o filtro de escopo é feito aqui, ANTES de somar/ordenar.
 * - `empresa_membros` (nomes) · `metas` + RPC `calcular_realizado_meta` ·
 *   `point_ledger` (atividade recente) · `conquistas_desbloqueadas` + `conquistas`.
 */
export async function carregarDadosGerencial(
  supabase: SupabaseServidor,
  atual: Pick<Vinculo, "membroId" | "empresaId" | "papel">,
  deslocamento: number,
): Promise<DadosGerencial> {
  const empresaId = atual.empresaId;
  const escopoMembros = await obterEscopoMembros(supabase, atual);
  const listaEscopo = escopoMembros ? [...escopoMembros] : null;
  const periodoAtual = limitesMes(deslocamento);
  const periodoAnterior = limitesMes(deslocamento + 1);
  const inicioSemanaIso = new Date(inicioDaSemana()).toISOString();
  // Mês corrente não precisa de limite superior (idêntico ao comportamento da visão
  // pessoal); mês passado fecha a janela pra não contar o mês corrente.
  const ateAtual = deslocamento > 0 ? periodoAtual.fimExclusivoIso : undefined;

  // Perfis × janelas. Cada item é uma chamada da RPC; resultados já filtrados pelo escopo.
  const consultaRanking = async (
    perfil: PerfilRankingGerencial,
    janela: { desde?: string; ate?: string },
  ): Promise<LinhaBrutaRanking[]> => {
    const { data, error } = await supabase.rpc("ranking_gamificacao", {
      p_empresa_id: empresaId,
      p_perfil: perfil,
      ...(janela.desde ? { p_desde: janela.desde } : {}),
      ...(janela.ate ? { p_ate: janela.ate } : {}),
    });
    if (error) throw error;
    return filtrarPorEscopo(data, escopoMembros);
  };

  const rankingsBrutos = Promise.all(
    PERFIS_RANKING_GERENCIAL.map(async (perfil) => {
      const [semana, mes, geral, anterior] = await Promise.all([
        consultaRanking(perfil, { desde: inicioSemanaIso }),
        consultaRanking(perfil, { desde: periodoAtual.inicioIso, ate: ateAtual }),
        consultaRanking(perfil, {}),
        consultaRanking(perfil, {
          desde: periodoAnterior.inicioIso,
          ate: periodoAnterior.fimExclusivoIso,
        }),
      ]);
      return { perfil, semana, mes, geral, anterior };
    }),
  );

  let queryMembros = supabase
    .from("empresa_membros")
    .select("id, perfis(nome, email)")
    .eq("empresa_id", empresaId);
  if (listaEscopo) queryMembros = queryMembros.in("id", listaEscopo);

  let queryMetas = supabase
    .from("metas")
    .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
    .eq("empresa_id", empresaId)
    .eq("ativa", true)
    .lte("periodo_inicio", paraDataCurta(new Date(periodoAtual.fimExclusivo.getTime() - 1)))
    .gte("periodo_fim", paraDataCurta(periodoAtual.inicio));
  if (listaEscopo) queryMetas = queryMetas.in("membro_id", listaEscopo);

  let queryAtividade = supabase
    .from("point_ledger")
    .select("id, xp, moedas, descricao, membro_id, created_at")
    .eq("empresa_id", empresaId)
    .eq("estornado", false)
    .gte("created_at", periodoAtual.inicioIso)
    .lt("created_at", periodoAtual.fimExclusivoIso)
    .order("created_at", { ascending: false })
    .limit(LIMITE_ATIVIDADE);
  if (listaEscopo) queryAtividade = queryAtividade.in("membro_id", listaEscopo);

  let queryConquistasPeriodo = supabase
    .from("conquistas_desbloqueadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .gte("desbloqueada_em", periodoAtual.inicioIso)
    .lt("desbloqueada_em", periodoAtual.fimExclusivoIso);
  if (listaEscopo) queryConquistasPeriodo = queryConquistasPeriodo.in("membro_id", listaEscopo);

  let queryConquistasRecentes = supabase
    .from("conquistas_desbloqueadas")
    .select("id, conquista_id, membro_id, desbloqueada_em")
    .eq("empresa_id", empresaId)
    .order("desbloqueada_em", { ascending: false })
    .limit(LIMITE_CONQUISTAS_RECENTES);
  if (listaEscopo) queryConquistasRecentes = queryConquistasRecentes.in("membro_id", listaEscopo);

  const [
    rankings,
    { data: membros, error: erroMembros },
    { data: metasLinhas, error: erroMetas },
    { data: atividadeBruta, error: erroAtividade },
    { count: conquistasPeriodo, error: erroConquistasPeriodo },
    { data: recentesBrutas, error: erroRecentes },
    { data: catalogoConquistas, error: erroCatalogo },
  ] = await Promise.all([
    rankingsBrutos,
    queryMembros,
    queryMetas,
    queryAtividade,
    queryConquistasPeriodo,
    queryConquistasRecentes,
    supabase.from("conquistas").select("id, nome, icone").eq("empresa_id", empresaId),
  ]);
  for (const erro of [
    erroMembros,
    erroMetas,
    erroAtividade,
    erroConquistasPeriodo,
    erroRecentes,
    erroCatalogo,
  ]) {
    if (erro) throw erro;
  }

  const nomeMembro = new Map(
    (membros ?? []).map((m) => {
      const p = m.perfis as unknown as { nome: string; email: string } | null;
      return [m.id, p?.nome || p?.email || "(sem nome)"] as const;
    }),
  );

  // KPIs de XP/participantes: linhas COMPLETAS do período, de todos os perfis, antes do top N.
  const linhasPeriodo = rankings.map((r) => r.mes);
  const xpDistribuido = linhasPeriodo.reduce((s, l) => s + somarXp(l), 0);
  const xpAnterior = rankings.reduce((s, r) => s + somarXp(r.anterior), 0);
  const participantes = contarParticipantes(linhasPeriodo);

  // Metas (realizado via RPC causal, mesma regra da visão pessoal).
  const metas: Meta[] = (metasLinhas ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    metrica: m.metrica as MetricaMeta,
    empresaId,
    membroId: m.membro_id,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    valorAlvo: m.valor_alvo,
    ativa: m.ativa,
  }));
  const metasGerenciais: MetaGerencial[] = (
    await Promise.all(
      metas.map(async (m) => ({
        id: m.id,
        titulo: m.titulo,
        metrica: m.metrica,
        membroNome: nomeMembro.get(m.membroId) ?? "(removido)",
        valorAlvo: m.valorAlvo,
        progresso: calcularProgresso(
          m.valorAlvo,
          await calcularRealizado(supabase, m),
          m.periodoInicio,
          m.periodoFim,
        ),
      })),
    )
  ).sort((a, b) => b.progresso.percentual - a.progresso.percentual);

  const catalogo = new Map((catalogoConquistas ?? []).map((c) => [c.id, c]));

  return {
    escopo: atual.papel === "admin" ? "empresa" : "equipe",
    gestorSemEquipe: escopoMembros !== null && escopoMembros.size <= 1,
    xpDistribuido,
    variacaoXpPct: variacaoPercentual(xpDistribuido, xpAnterior),
    participantes,
    metasAtingidas: metasGerenciais.filter((m) => m.progresso.percentual >= 100).length,
    metasTotal: metasGerenciais.length,
    conquistasPeriodo: conquistasPeriodo ?? 0,
    rankings: rankings.map((r) => ({
      perfil: r.perfil,
      semana: construirRankingCompleto(r.semana, nomeMembro),
      mes: construirRankingCompleto(r.mes, nomeMembro),
      geral: construirRankingCompleto(r.geral, nomeMembro),
    })),
    metas: metasGerenciais,
    atividade: (atividadeBruta ?? []).map((l) => ({
      id: l.id,
      membroNome: nomeMembro.get(l.membro_id) ?? "(removido)",
      descricao: l.descricao || "Ponto lançado",
      xp: l.xp,
      moedas: l.moedas,
      createdAt: l.created_at,
    })),
    conquistasRecentes: (recentesBrutas ?? []).map((d) => ({
      id: d.id,
      membroNome: nomeMembro.get(d.membro_id) ?? "(removido)",
      conquistaNome: catalogo.get(d.conquista_id)?.nome ?? "(conquista removida)",
      icone: catalogo.get(d.conquista_id)?.icone ?? null,
      desbloqueadaEm: d.desbloqueada_em,
    })),
  };
}
