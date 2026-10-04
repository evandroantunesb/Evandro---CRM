import Link from "next/link";
import {
  Activity,
  Award,
  BarChart3,
  FileCheck2,
  Gift,
  LineChart,
  Medal,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda, tempoDesde } from "@/lib/formatacao";
import { calcularNivel } from "@/lib/gamificacao";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { UNIDADE_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import { CartaoGf, EstadoVazioGf, KpiGf } from "./_compartilhado/ui";
import { CartaoRecompensaGf } from "./_compartilhado/recompensa-preview";

function formatarValorMeta(unidade: "moeda" | "quantidade" | "percentual", valor: number) {
  if (unidade === "moeda") return formatarMoeda(valor);
  if (unidade === "percentual") return `${valor.toFixed(1)}%`;
  return Math.round(valor).toLocaleString("pt-BR");
}

const PERIODOS = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
] as const;
type PeriodoChave = (typeof PERIODOS)[number]["chave"];

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

/** Variação percentual vs. o período anterior. Sem baseline real (anterior = 0), não inventa uma % — retorna null. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export default async function GamificacaoDashboard({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { atual } = await exigirPapel();
  const { periodo: periodoParam } = await searchParams;
  const periodo = (
    PERIODOS.some((p) => p.chave === periodoParam) ? periodoParam : "mes"
  ) as PeriodoChave;
  const deslocamento = periodo === "mes-passado" ? 1 : 0;

  const supabase = await criarClienteServidor();
  const atualMes = limitesMes(deslocamento);
  const anteriorMes = limitesMes(deslocamento + 1);

  const [
    { data: pontosPeriodo },
    { data: pontosAnteriorAgg },
    { data: negociosPeriodo },
    { data: negociosAnterior },
    { data: rankingBruto },
    { data: niveis },
    { data: xpTotais },
    { data: moedasTotais },
    { data: conquistas },
    { data: desbloqueadas },
    { data: recompensas },
    { data: metasLinhas },
    config,
  ] = await Promise.all([
    supabase
      .from("point_ledger")
      .select("id, xp, moedas, descricao, membro_id, created_at")
      .eq("empresa_id", atual.empresaId)
      .eq("estornado", false)
      .gte("created_at", atualMes.inicioIso)
      .lt("created_at", atualMes.fimExclusivoIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("point_ledger")
      .select("xp")
      .eq("empresa_id", atual.empresaId)
      .eq("estornado", false)
      .gte("created_at", anteriorMes.inicioIso)
      .lt("created_at", anteriorMes.fimExclusivoIso)
      .limit(5000),
    supabase
      .from("negocios")
      .select("valor")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "ganho")
      .gte("fechado_em", atualMes.inicioIso)
      .lt("fechado_em", atualMes.fimExclusivoIso)
      .limit(10000),
    supabase
      .from("negocios")
      .select("valor")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "ganho")
      .gte("fechado_em", anteriorMes.inicioIso)
      .lt("fechado_em", anteriorMes.fimExclusivoIso)
      .limit(10000),
    supabase.rpc("ranking_gamificacao", {
      p_empresa_id: atual.empresaId,
      p_perfil: atual.perfilGamificacao ?? "closer",
      p_desde: atualMes.inicioIso,
    }),
    supabase
      .from("niveis_gamificacao")
      .select("nivel, nome, xp_minimo")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .order("xp_minimo"),
    supabase
      .from("point_ledger")
      .select("xp")
      .eq("membro_id", atual.membroId)
      .eq("estornado", false)
      .limit(20000),
    supabase
      .from("point_ledger")
      .select("moedas")
      .eq("membro_id", atual.membroId)
      .eq("estornado", false)
      .limit(20000),
    // Sem filtro de ativa: isto só identifica conquistas já desbloqueadas (ver minhasConquistas
    // abaixo), que continuam visíveis mesmo se a conquista for desativada depois.
    supabase.from("conquistas").select("id, nome, icone").eq("empresa_id", atual.empresaId),
    supabase
      .from("conquistas_desbloqueadas")
      .select("conquista_id, desbloqueada_em")
      .eq("membro_id", atual.membroId)
      .order("desbloqueada_em", { ascending: false })
      .limit(3),
    supabase
      .from("recompensas")
      .select("id, nome, descricao, custo_moedas")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .or(`validade_ate.is.null,validade_ate.gte.${paraDataCurta(new Date())}`)
      .order("custo_moedas")
      .limit(3),
    supabase
      .from("metas")
      .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .lte("periodo_inicio", paraDataCurta(new Date(atualMes.fimExclusivo.getTime() - 1)))
      .gte("periodo_fim", paraDataCurta(atualMes.inicio)),
    carregarConfiguracao(atual.empresaId),
  ]);

  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));

  // KPIs -----------------------------------------------------------------
  const totalXpPeriodo = (pontosPeriodo ?? []).reduce((s, l) => s + l.xp, 0);
  const totalXpAnterior = (pontosAnteriorAgg ?? []).reduce((s, l) => s + l.xp, 0);
  const contratosPeriodo = (negociosPeriodo ?? []).length;
  const contratosAnterior = (negociosAnterior ?? []).length;

  const metas: Meta[] = (metasLinhas ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    metrica: m.metrica as MetricaMeta,
    empresaId: atual.empresaId,
    membroId: m.membro_id,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    valorAlvo: m.valor_alvo,
    ativa: m.ativa,
  }));
  const progressosMetas = await Promise.all(
    metas.map(async (m) =>
      calcularProgresso(
        m.valorAlvo,
        await calcularRealizado(supabase, m),
        m.periodoInicio,
        m.periodoFim,
      ),
    ),
  );
  // Zip pra mostrar a meta principal (maior % concluído) com destaque, igual à
  // referência — mesmos dados de `metas`/`progressosMetas`, só reorganizados.
  const metasComProgresso = metas
    .map((m, i) => ({ meta: m, progresso: progressosMetas[i] }))
    .sort((a, b) => b.progresso.percentual - a.progresso.percentual);
  const metaPrincipal = metasComProgresso[0] ?? null;

  // Evolução de XP (acumulado por dia no período) --------------------------
  const diasNoPeriodo = Math.round(
    (atualMes.fimExclusivo.getTime() - atualMes.inicio.getTime()) / 86_400_000,
  );
  const porDia = new Array(diasNoPeriodo).fill(0) as number[];
  for (const l of pontosPeriodo ?? []) {
    const dia = Math.floor(
      (new Date(l.created_at).getTime() - atualMes.inicio.getTime()) / 86_400_000,
    );
    if (dia >= 0 && dia < diasNoPeriodo) porDia[dia] += l.xp;
  }
  const hoje = new Date();
  const diasComDados =
    periodo === "mes"
      ? Math.floor((hoje.getTime() - atualMes.inicio.getTime()) / 86_400_000) + 1
      : diasNoPeriodo;
  const serieAcumulada = porDia
    .slice(0, Math.max(2, Math.min(diasComDados, diasNoPeriodo)))
    .reduce<number[]>((acc, v) => {
      acc.push((acc.at(-1) ?? 0) + v);
      return acc;
    }, []);

  // Ações que mais geram XP -------------------------------------------------
  const porAcao = new Map<string, number>();
  for (const l of pontosPeriodo ?? []) {
    if (!l.descricao || l.xp === 0) continue;
    porAcao.set(l.descricao, (porAcao.get(l.descricao) ?? 0) + l.xp);
  }
  const topAcoes = [...porAcao.entries()]
    .map(([rotulo, total]) => ({ rotulo, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Ranking (XP ativo, por perfil/período) ---------------------------------
  const niveisNormalizados = (niveis ?? []).map((n) => ({
    nivel: n.nivel,
    nome: n.nome,
    xpMinimo: n.xp_minimo,
  }));
  const rankingCompleto = (rankingBruto ?? [])
    .filter((l) => nomeMembro.has(l.membro_id))
    .sort((a, b) => b.total_xp - a.total_xp)
    .map((l, i) => ({
      posicao: i + 1,
      membroId: l.membro_id,
      nome: nomeMembro.get(l.membro_id)!,
      total: l.total_xp,
    }));
  const ranking = rankingCompleto.slice(0, 5);
  // Minha posição no ranking do período + quem está logo acima — reaproveita o
  // mesmo resultado da RPC já consultada acima, sem truncar em 5, só pra achar
  // minha colocação mesmo quando fico fora do top 5 exibido.
  const minhaPosicaoRanking = rankingCompleto.find((r) => r.membroId === atual.membroId) ?? null;
  const acimaDeMim = minhaPosicaoRanking
    ? (rankingCompleto.find((r) => r.posicao === minhaPosicaoRanking.posicao - 1) ?? null)
    : null;

  // Meu nível: sempre XP ativo da vida toda, nunca o total filtrado do
  // ranking (era a origem de dois níveis diferentes pra mesma pessoa —
  // corrigido via fonte única em calcularNivel).
  const meuTotalXp = (xpTotais ?? []).reduce((s, l) => s + l.xp, 0);
  const meuSaldoMoedas = (moedasTotais ?? []).reduce((s, l) => s + l.moedas, 0);
  const {
    nivel: meuNivelNumero,
    nome: meuNivelNome,
    proximoNivel,
    progresso: progressoNivel,
  } = calcularNivel(niveisNormalizados, meuTotalXp);
  const meuNivel = { nivel: meuNivelNumero, nome: meuNivelNome };

  // Minhas conquistas + atividade recente ---------------------------------
  const nomeConquista = new Map((conquistas ?? []).map((c) => [c.id, c]));
  const minhasConquistas = (desbloqueadas ?? []).map((d) => ({
    conquistaId: d.conquista_id,
    desbloqueadaEm: d.desbloqueada_em,
    ...nomeConquista.get(d.conquista_id),
  }));

  const atividadeRecente = (pontosPeriodo ?? []).slice(0, 6);
  const unidadeMetaPrincipal = metaPrincipal
    ? UNIDADE_METRICA_META[metaPrincipal.meta.metrica]
    : null;

  return (
    <div className="-m-4 min-h-screen bg-[var(--gf-bg)] p-4 text-[var(--gf-texto)] md:-m-10 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        {/* Cabeçalho + KPIs compactos na mesma faixa, como na referência aprovada. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--gf-texto)]">Gamificação</h1>
            <p className="text-sm text-[var(--gf-texto-sec)]">
              Desempenho, evolução e conquistas em um só lugar.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[var(--gf-surface-alta)] p-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.chave}
                href={`/gamificacao?periodo=${p.chave}`}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  periodo === p.chave
                    ? "bg-[var(--gf-surface)] font-medium text-[var(--gf-texto)] shadow-sm"
                    : "text-[var(--gf-texto-sec)] hover:text-[var(--gf-texto)]"
                }`}
              >
                {p.rotulo}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiGf
            Icone={Zap}
            valor={`${totalXpPeriodo.toLocaleString("pt-BR")} XP`}
            legenda="No período"
            variacaoPct={variacao(totalXpPeriodo, totalXpAnterior)}
          />
          <KpiGf
            Icone={Trophy}
            valor={minhaPosicaoRanking ? `#${minhaPosicaoRanking.posicao}` : "—"}
            legenda="Posição no ranking"
          />
          <KpiGf
            Icone={FileCheck2}
            valor={contratosPeriodo.toLocaleString("pt-BR")}
            legenda="Contratos assinados"
            variacaoPct={variacao(contratosPeriodo, contratosAnterior)}
          />
          <KpiGf
            Icone={Award}
            valor={minhasConquistas.length.toLocaleString("pt-BR")}
            legenda="Conquistas"
          />
        </div>

        {/* Hero: minha posição ganha protagonismo (2/3), meu nível ao lado. */}
        <div className="grid gap-3 lg:grid-cols-3">
          <CartaoGf destaque className="lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-xs tracking-wide text-[var(--gf-texto-sec)] uppercase">
                  <Trophy size={12} className="text-[var(--gf-dourado)]" />
                  Minha posição
                </p>
                <p className="mt-1 text-3xl font-semibold text-[var(--gf-texto)]">
                  {minhaPosicaoRanking ? `#${minhaPosicaoRanking.posicao}` : "—"}
                  <span className="ml-2 text-base font-normal text-[var(--gf-texto-sec)]">
                    {periodo === "mes" ? "no ranking do mês" : "no ranking do período"}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[var(--gf-texto-sec)]">
                  {minhaPosicaoRanking
                    ? `${minhaPosicaoRanking.total.toLocaleString("pt-BR")} XP no período`
                    : "Pontue neste período pra entrar no ranking."}
                </p>
              </div>
              {minhaPosicaoRanking && acimaDeMim && (
                <div className="shrink-0 rounded-lg bg-[var(--gf-surface-alta)] px-4 py-3 text-sm sm:text-right">
                  <p className="text-[var(--gf-texto-sec)]">Você está a</p>
                  <p className="font-semibold text-[var(--gf-verde)]">
                    {(acimaDeMim.total - minhaPosicaoRanking.total).toLocaleString("pt-BR")} XP
                  </p>
                  <p className="text-[var(--gf-texto-sec)]">
                    do {acimaDeMim.posicao}º lugar ({acimaDeMim.nome})
                  </p>
                </div>
              )}
            </div>
          </CartaoGf>

          <CartaoGf destaque>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gf-verde-10)] text-lg font-semibold text-[var(--gf-verde)]">
                {meuNivel.nivel}
              </span>
              <div className="min-w-0">
                <p className="text-xs tracking-wide text-[var(--gf-texto-sec)] uppercase">
                  Meu nível
                </p>
                <p className="truncate text-base font-semibold text-[var(--gf-texto)]">
                  {meuNivel.nome ?? `Nível ${meuNivel.nivel}`}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs text-[var(--gf-texto-sec)]">
                <span>{meuTotalXp.toLocaleString("pt-BR")} XP</span>
                {proximoNivel && (
                  <span>
                    {(proximoNivel.xpMinimo - meuTotalXp).toLocaleString("pt-BR")} p/ nível{" "}
                    {proximoNivel.nivel}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
                <div
                  className="h-full rounded-full bg-[var(--gf-verde)]"
                  style={{ width: `${progressoNivel}%` }}
                />
              </div>
              {!proximoNivel && (
                <p className="mt-1 text-xs text-[var(--gf-texto-sec)]">Nível máximo alcançado.</p>
              )}
            </div>
            <Link
              href="/gamificacao/jornada"
              className="mt-2 inline-block text-xs text-[var(--gf-verde)] hover:underline"
            >
              Ver jornada completa →
            </Link>
          </CartaoGf>
        </div>

        {/* Ranking com mais presença (2/3) + metas e loja compactas ao lado. */}
        <div className="grid gap-3 lg:grid-cols-3">
          <CartaoGf
            titulo="Ranking da equipe"
            acao={
              <Link
                href="/gamificacao/ranking"
                className="text-sm text-[var(--gf-verde)] hover:underline"
              >
                Ver completo →
              </Link>
            }
            className="lg:col-span-2"
          >
            {!ranking.length ? (
              <EstadoVazioGf Icone={Users}>Ninguém pontuou neste período ainda.</EstadoVazioGf>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ranking.map((r) => (
                  <li
                    key={r.membroId}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                      r.membroId === atual.membroId
                        ? "bg-[var(--gf-verde-10)]"
                        : r.posicao <= 3
                          ? "bg-[var(--gf-surface-alta)]"
                          : ""
                    }`}
                  >
                    <span className="flex w-6 shrink-0 items-center justify-center">
                      {r.posicao === 1 ? (
                        <Trophy size={16} className="text-[var(--gf-dourado)]" />
                      ) : r.posicao <= 3 ? (
                        <Medal size={15} className="text-[var(--gf-texto-sec)]" />
                      ) : (
                        <span className="text-[var(--gf-texto-sec)]">{r.posicao}º</span>
                      )}
                    </span>
                    <span
                      className={`flex-1 truncate ${r.membroId === atual.membroId ? "font-medium text-[var(--gf-verde)]" : "text-[var(--gf-texto)]"}`}
                    >
                      {r.nome}
                    </span>
                    <span className="font-medium text-[var(--gf-texto)]">
                      {r.total.toLocaleString("pt-BR")} XP
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CartaoGf>

          <div className="flex flex-col gap-3">
            <CartaoGf
              titulo="Metas"
              acao={
                <Link
                  href="/gamificacao/metas"
                  className="text-sm text-[var(--gf-verde)] hover:underline"
                >
                  Ver →
                </Link>
              }
            >
              {!metaPrincipal || !unidadeMetaPrincipal ? (
                <EstadoVazioGf Icone={Target}>Nenhuma meta ativa no momento.</EstadoVazioGf>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="truncate text-sm text-[var(--gf-texto-sec)]">
                    {metaPrincipal.meta.titulo}
                  </p>
                  <p className="text-sm font-semibold text-[var(--gf-texto)]">
                    {formatarValorMeta(unidadeMetaPrincipal, metaPrincipal.progresso.realizado)} /{" "}
                    {formatarValorMeta(unidadeMetaPrincipal, metaPrincipal.meta.valorAlvo)}
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
                    <div
                      className="h-full rounded-full bg-[var(--gf-verde)]"
                      style={{
                        width: `${Math.min(Math.max(metaPrincipal.progresso.percentual, 0), 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-[var(--gf-texto-sec)]">
                    {metaPrincipal.progresso.percentual.toFixed(0)}% concluído
                    {metasComProgresso.length > 1 &&
                      ` · +${metasComProgresso.length - 1} outra${metasComProgresso.length - 1 === 1 ? "" : "s"} meta${metasComProgresso.length - 1 === 1 ? "" : "s"}`}
                  </p>
                </div>
              )}
            </CartaoGf>

            <CartaoGf
              titulo="Loja"
              acao={
                <Link
                  href="/gamificacao/loja"
                  className="text-sm text-[var(--gf-verde)] hover:underline"
                >
                  Ver →
                </Link>
              }
            >
              {!recompensas?.length ? (
                <EstadoVazioGf Icone={Gift}>Nenhuma recompensa disponível.</EstadoVazioGf>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-[var(--gf-texto-sec)]">
                    Seu saldo:{" "}
                    <span className="font-semibold text-[var(--gf-texto)]">
                      {meuSaldoMoedas.toLocaleString("pt-BR")} moedas
                    </span>
                  </p>
                  {recompensas.slice(0, 2).map((r) => (
                    <CartaoRecompensaGf
                      key={r.id}
                      recompensa={{
                        id: r.id,
                        nome: r.nome,
                        descricao: r.descricao,
                        custoMoedas: r.custo_moedas,
                      }}
                      saldo={meuSaldoMoedas}
                    />
                  ))}
                </div>
              )}
            </CartaoGf>
          </div>
        </div>

        {/* Atividade recente em feed (2/3) + conquistas compactas (1/3). */}
        <div className="grid gap-3 lg:grid-cols-3">
          <CartaoGf titulo="Atividade recente" className="lg:col-span-2">
            {!atividadeRecente.length ? (
              <EstadoVazioGf Icone={Activity}>Nenhuma atividade neste período.</EstadoVazioGf>
            ) : (
              <ul className="flex flex-col">
                {atividadeRecente.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2.5 border-t border-[var(--gf-borda)] py-2 text-sm first:border-t-0"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${l.xp >= 0 ? "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]" : "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]"}`}
                    >
                      <Zap size={13} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[var(--gf-texto)]">
                        {nomeMembro.get(l.membro_id) ?? "(removido)"} ·{" "}
                        {l.descricao || "Ponto lançado"}
                      </span>
                      <span className="text-xs text-[var(--gf-texto-sec)]">
                        {tempoDesde(l.created_at)}
                      </span>
                    </div>
                    {l.xp !== 0 && (
                      <span
                        className={`shrink-0 font-medium ${l.xp >= 0 ? "text-[var(--gf-verde)]" : "text-[var(--gf-vermelho)]"}`}
                      >
                        {l.xp >= 0 ? "+" : ""}
                        {l.xp} XP
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CartaoGf>

          <CartaoGf
            titulo="Conquistas"
            acao={
              <Link
                href="/gamificacao/jornada"
                className="text-sm text-[var(--gf-verde)] hover:underline"
              >
                Ver →
              </Link>
            }
          >
            {!minhasConquistas.length ? (
              <EstadoVazioGf Icone={Award}>Nenhuma conquista desbloqueada ainda.</EstadoVazioGf>
            ) : (
              <ul className="flex flex-col gap-2">
                {minhasConquistas.map((c) => (
                  <li key={c.conquistaId} className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                      {c.icone ? (
                        <span className="text-sm leading-none">{c.icone}</span>
                      ) : (
                        <Trophy size={14} />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[var(--gf-texto)]">
                        {c.nome ?? "(conquista removida)"}
                      </span>
                      <span className="text-xs text-[var(--gf-texto-sec)]">
                        {tempoDesde(c.desbloqueadaEm)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CartaoGf>
        </div>

        {/* Camada secundária: gráficos de evolução, mais discretos na hierarquia. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <CartaoGf
            titulo="Evolução de XP"
            acao={
              <Link
                href="/gamificacao/extrato"
                className="text-sm text-[var(--gf-verde)] hover:underline"
              >
                Ver extrato →
              </Link>
            }
          >
            {serieAcumulada.length < 2 ? (
              <EstadoVazioGf Icone={LineChart}>Sem dados suficientes neste período.</EstadoVazioGf>
            ) : (
              <>
                <p className="text-sm text-[var(--gf-texto-sec)]">
                  <span className="text-lg font-semibold text-[var(--gf-texto)]">
                    {totalXpPeriodo.toLocaleString("pt-BR")}
                  </span>{" "}
                  XP no período
                </p>
                <GraficoLinha serie={serieAcumulada} />
              </>
            )}
          </CartaoGf>

          <CartaoGf titulo="Ações que mais geram XP">
            {!topAcoes.length ? (
              <EstadoVazioGf Icone={BarChart3}>Nenhum ponto lançado neste período.</EstadoVazioGf>
            ) : (
              <GraficoBarras itens={topAcoes} />
            )}
          </CartaoGf>
        </div>
      </div>
    </div>
  );
}

function GraficoLinha({ serie }: { serie: number[] }) {
  const largura = 100;
  const altura = 32;
  const maxValor = Math.max(1, ...serie);
  const passoX = largura / (serie.length - 1);
  const pontos = serie
    .map((v, i) => `${(i * passoX).toFixed(2)},${(altura - (v / maxValor) * altura).toFixed(2)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      className="mt-2 h-28 w-full"
    >
      <polyline
        points={pontos}
        fill="none"
        stroke="var(--gf-verde)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function GraficoBarras({ itens }: { itens: { rotulo: string; total: number }[] }) {
  const maxValor = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
      {itens.map((item) => (
        <div key={item.rotulo} className="flex h-full flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--gf-texto)]">
            {item.total.toLocaleString("pt-BR")}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-[var(--gf-verde)]"
              style={{ height: `${Math.max(4, (item.total / maxValor) * 100)}%` }}
            />
          </div>
          <span
            className="w-full truncate text-center text-[11px] text-[var(--gf-texto-sec)]"
            title={item.rotulo}
          >
            {item.rotulo}
          </span>
        </div>
      ))}
    </div>
  );
}
