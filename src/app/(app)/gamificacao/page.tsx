import Link from "next/link";
import {
  Activity,
  Award,
  BarChart3,
  Check,
  Crown,
  Flame,
  Gift,
  LineChart,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda, inicioDaSemana, tempoDesde } from "@/lib/formatacao";
import { calcularNivel } from "@/lib/gamificacao";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { UNIDADE_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import {
  CartaoGf,
  EstadoVazioGf,
  IndicadorKpiGf,
  IniciaisAvatarGf,
  KpiGf,
} from "./_compartilhado/ui";
import { CartaoRecompensaGf } from "./_compartilhado/recompensa-preview";

type RankingLinha = { posicao: number; membroId: string; nome: string; total: number };
type DiaSequencia = { data: string; dia_util: boolean; produtivo: boolean };

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

function construirRanking(
  bruto: { membro_id: string; total_xp: number }[] | null,
  nomeMembro: Map<string, string>,
): RankingLinha[] {
  return (bruto ?? [])
    .filter((l) => nomeMembro.has(l.membro_id))
    .sort((a, b) => b.total_xp - a.total_xp)
    .map((l, i) => ({
      posicao: i + 1,
      membroId: l.membro_id,
      nome: nomeMembro.get(l.membro_id)!,
      total: l.total_xp,
    }));
}

const ROTULOS_DIA_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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
  const perfil = atual.perfilGamificacao ?? "closer";

  const supabase = await criarClienteServidor();
  const atualMes = limitesMes(deslocamento);
  const anteriorMes = limitesMes(deslocamento + 1);
  const inicioSemanaIso = new Date(inicioDaSemana()).toISOString();

  const [
    { data: pontosPeriodo },
    { data: pontosAnteriorAgg },
    { data: rankingBruto },
    { data: rankingHistoricoSemanaBruto },
    { data: sequenciaBruta },
    { data: progressoConquistasBruto },
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
    supabase.rpc("ranking_gamificacao", {
      p_empresa_id: atual.empresaId,
      p_perfil: perfil,
      p_desde: atualMes.inicioIso,
    }),
    // Mesma janela do período selecionado, reconstruída no instante do início desta
    // semana (ver migration `gamificacao_ranking_historico`) — só pra calcular a
    // variação de posição "esta semana" do KPI/hero. Sem invenção de baseline: se o
    // intervalo for vazio/inconsistente (ex.: "Mês passado" selecionado), a função
    // simplesmente não encontra o membro e a variação fica null.
    supabase.rpc("ranking_gamificacao", {
      p_empresa_id: atual.empresaId,
      p_perfil: perfil,
      p_desde: atualMes.inicioIso,
      p_ate: inicioSemanaIso,
    }),
    supabase.rpc("sequencia_produtiva_membro", { p_empresa_id: atual.empresaId }),
    supabase.rpc("progresso_conquistas_membro", { p_empresa_id: atual.empresaId }),
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
    // Sem limite: usado tanto pra "última conquista" quanto pro total/novas-no-período do KPI.
    supabase
      .from("conquistas_desbloqueadas")
      .select("conquista_id, desbloqueada_em")
      .eq("membro_id", atual.membroId)
      .order("desbloqueada_em", { ascending: false }),
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
  const variacaoXpPct = variacao(totalXpPeriodo, totalXpAnterior);

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
  const metasAtingidas = metasComProgresso.filter((m) => m.progresso.percentual >= 100).length;
  const metasTotal = metasComProgresso.length;

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

  // Ranking (XP ativo, por perfil/período) + variação de posição esta semana ----
  const niveisNormalizados = (niveis ?? []).map((n) => ({
    nivel: n.nivel,
    nome: n.nome,
    xpMinimo: n.xp_minimo,
  }));
  const rankingCompleto = construirRanking(rankingBruto, nomeMembro);
  const ranking = rankingCompleto.slice(0, 5);
  // Minha posição no ranking do período + quem está logo acima — reaproveita o
  // mesmo resultado da RPC já consultada acima, sem truncar em 5, só pra achar
  // minha colocação mesmo quando fico fora do top 5 exibido.
  const minhaPosicaoRanking = rankingCompleto.find((r) => r.membroId === atual.membroId) ?? null;
  const acimaDeMim = minhaPosicaoRanking
    ? (rankingCompleto.find((r) => r.posicao === minhaPosicaoRanking.posicao - 1) ?? null)
    : null;

  const rankingSemanaPassada = construirRanking(rankingHistoricoSemanaBruto, nomeMembro);
  const minhaPosicaoSemanaPassada =
    rankingSemanaPassada.find((r) => r.membroId === atual.membroId) ?? null;
  // Positivo = subiu (número da posição diminuiu). Sem registro histórico (membro
  // novo, ou período sem sobreposição com "esta semana"), fica null — nunca inventa.
  const deltaPosicaoSemana =
    minhaPosicaoSemanaPassada && minhaPosicaoRanking
      ? minhaPosicaoSemanaPassada.posicao - minhaPosicaoRanking.posicao
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

  // Sequência produtiva -----------------------------------------------------
  const sequenciaLinha = sequenciaBruta?.[0];
  const diasSequencia = sequenciaLinha?.sequencia ?? 0;
  const semanaSequencia = (sequenciaLinha?.semana as unknown as DiaSequencia[] | undefined) ?? [];

  // Conquistas: última + próxima (com progresso) + contagem do período -------
  const nomeConquista = new Map((conquistas ?? []).map((c) => [c.id, c]));
  const todasDesbloqueadas = desbloqueadas ?? [];
  const totalConquistasDesbloqueadas = todasDesbloqueadas.length;
  const conquistasNovasPeriodo = todasDesbloqueadas.filter(
    (d) => d.desbloqueada_em >= atualMes.inicioIso && d.desbloqueada_em < atualMes.fimExclusivoIso,
  ).length;
  const ultimaDesbloqueada = todasDesbloqueadas[0] ?? null;
  const ultimaConquista = ultimaDesbloqueada
    ? { ...nomeConquista.get(ultimaDesbloqueada.conquista_id), desbloqueadaEm: ultimaDesbloqueada.desbloqueada_em }
    : null;
  const proximaConquista =
    (progressoConquistasBruto ?? [])
      .map((p) => ({ ...p, info: nomeConquista.get(p.conquista_id) }))
      .filter((p) => p.info)
      .sort((a, b) => (b.alvo > 0 ? b.realizado / b.alvo : 0) - (a.alvo > 0 ? a.realizado / a.alvo : 0))[0] ??
    null;

  const atividadeRecente = (pontosPeriodo ?? []).slice(0, 4);
  const unidadeMetaPrincipal = metaPrincipal
    ? UNIDADE_METRICA_META[metaPrincipal.meta.metrica]
    : null;

  return (
    <div className="-m-4 min-h-screen bg-[var(--gf-bg)] p-4 text-[var(--gf-texto)] md:-m-10 md:p-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-2">
        {/* Cabeçalho e KPIs na mesma faixa no desktop. */}
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1fr)] lg:items-center">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--gf-texto)]">Gamificação</h1>
            <p className="text-sm text-[var(--gf-texto-sec)]">
              Desempenho, evolução e conquistas em um só lugar.
            </p>
          </div>
          <div className="hidden gap-1 rounded-lg bg-[var(--gf-surface-alta)] p-1">
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
            indicador={
              variacaoXpPct != null && (
                <IndicadorKpiGf
                  direcao={variacaoXpPct >= 0 ? "alta" : "baixa"}
                  texto={`${Math.abs(variacaoXpPct).toFixed(0)}%`}
                />
              )
            }
          />
          <KpiGf
            Icone={Trophy}
            valor={minhaPosicaoRanking ? `#${minhaPosicaoRanking.posicao}` : "—"}
            legenda="Posição no ranking"
            indicador={
              deltaPosicaoSemana != null &&
              deltaPosicaoSemana !== 0 && (
                <IndicadorKpiGf
                  direcao={deltaPosicaoSemana > 0 ? "alta" : "baixa"}
                  texto={`${Math.abs(deltaPosicaoSemana)} esta semana`}
                />
              )
            }
          />
          <KpiGf
            Icone={Target}
            valor={`${metasAtingidas}/${metasTotal}`}
            legenda="Metas atingidas"
          />
          <KpiGf
            Icone={Award}
            valor={totalConquistasDesbloqueadas.toLocaleString("pt-BR")}
            legenda="Conquistas"
            indicador={
              conquistasNovasPeriodo > 0 && (
                <span className="text-[10px] font-medium text-[var(--gf-verde)]">
                  +{conquistasNovasPeriodo}
                </span>
              )
            }
          />
        </div>

        </div>

        {/* Hero: proporções fixas da referência no desktop. */}
        <div className="grid items-stretch gap-2 lg:h-[154px] lg:grid-cols-[2.56fr_1.27fr_1fr]">
          <CartaoGf destaque className="overflow-hidden !p-4 lg:h-full">
            {!minhaPosicaoRanking ? (
              <EstadoVazioGf Icone={Trophy} compacto>
                Pontue neste período pra entrar no ranking.
              </EstadoVazioGf>
            ) : (
              <div className="flex h-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="flex items-center gap-1.5 text-xs tracking-wide text-[var(--gf-texto-sec)] uppercase">
                    <Trophy size={12} className="text-[var(--gf-dourado)]" />
                    Minha posição
                  </p>
                  <p className="mt-1 text-4xl font-semibold text-[var(--gf-texto)]">
                    {`#${minhaPosicaoRanking.posicao}`}
                    <span className="ml-2 text-base font-normal text-[var(--gf-texto-sec)]">
                      {periodo === "mes" ? "no ranking do mês" : "no ranking do período"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--gf-texto-sec)]">
                    {minhaPosicaoRanking.total.toLocaleString("pt-BR")} XP no período
                  </p>
                  {deltaPosicaoSemana != null && deltaPosicaoSemana !== 0 && (
                    <div className="mt-2">
                      <IndicadorKpiGf
                        direcao={deltaPosicaoSemana > 0 ? "alta" : "baixa"}
                        texto={`${Math.abs(deltaPosicaoSemana)} posiç${Math.abs(deltaPosicaoSemana) === 1 ? "ão" : "ões"} esta semana`}
                      />
                    </div>
                  )}
                </div>
                {acimaDeMim && (
                  <div className="shrink-0 rounded-lg bg-[var(--gf-surface)] px-4 py-3 text-sm sm:text-right">
                    <p className="text-[var(--gf-texto-sec)]">Próxima posição</p>
                    <p className="font-semibold text-[var(--gf-verde)]">
                      {(acimaDeMim.total - minhaPosicaoRanking.total).toLocaleString("pt-BR")} XP
                    </p>
                    <p className="text-[var(--gf-texto-sec)]">
                      pra alcançar {acimaDeMim.nome} ({acimaDeMim.posicao}º lugar)
                    </p>
                  </div>
                )}
              </div>
            )}
          </CartaoGf>

          <CartaoGf destaque className="flex flex-col !p-4 lg:h-full">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--gf-verde-10)] text-lg font-semibold text-[var(--gf-verde)] [clip-path:polygon(25%_5%,75%_5%,100%_50%,75%_95%,25%_95%,0_50%)] ring-1 ring-[var(--gf-verde)]/60 drop-shadow-[0_0_8px_rgba(52,211,153,.25)]">
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

          <CartaoGf destaque className="!p-4 lg:h-full">
            <div className="flex items-center gap-1.5 text-xs tracking-wide text-[var(--gf-texto-sec)] uppercase">
              <Flame size={16} className="text-[var(--gf-verde)] drop-shadow-[0_0_6px_rgba(52,211,153,.35)]" />
              Sequência
            </div>
            <p className="mt-1 text-2xl font-semibold text-[var(--gf-texto)]">
              {diasSequencia}{" "}
              <span className="text-sm font-normal text-[var(--gf-texto-sec)]">
                dia{diasSequencia === 1 ? "" : "s"} produtivo{diasSequencia === 1 ? "" : "s"}{" "}
                consecutivo{diasSequencia === 1 ? "" : "s"}
              </span>
            </p>
            {semanaSequencia.length > 0 && (
              <div className="mt-3 flex justify-between gap-1">
                {semanaSequencia.map((dia, i) => (
                  <div key={dia.data} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--gf-texto-ter)]">
                      {ROTULOS_DIA_SEMANA[i] ?? ""}
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        dia.produtivo
                          ? "bg-[var(--gf-verde)] text-[var(--gf-surface)]"
                          : dia.dia_util
                            ? "border border-[var(--gf-borda)]"
                            : "bg-[var(--gf-surface-alta)]"
                      }`}
                    >
                      {dia.produtivo && <Check size={12} strokeWidth={3} />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CartaoGf>
        </div>

        {/* Área principal: Ranking (5/12), Centro (4/12), Lateral direita (3/12). */}
        <div className="grid gap-2 lg:h-[388px] lg:grid-cols-[1.19fr_1fr_1.05fr]">
          <CartaoGf
            titulo={<span className="flex items-center gap-2"><Crown size={15} className="text-[var(--gf-dourado)]" />Ranking</span>}
            acao={
              <Link
                href="/gamificacao/ranking"
                className="text-sm text-[var(--gf-verde)] hover:underline"
              >
                Ver completo →
              </Link>
            }
            className="flex min-h-[300px] flex-col overflow-hidden lg:h-full lg:min-h-0"
          >
            <div
              className={`flex min-h-0 flex-1 flex-col overflow-hidden ${!ranking.length ? "items-center justify-center" : ""}`}
            >
              {!ranking.length ? (
                <EstadoVazioGf Icone={Users} compacto>
                  Ninguém pontuou neste período ainda.
                </EstadoVazioGf>
              ) : (
                <>
                    {ranking.length >= 2 && (
                      <div className="mb-4 flex items-end justify-center gap-3">
                        {[ranking[1], ranking[0], ranking[2]].map(
                          (r) =>
                            r && (
                              <div
                                key={r.membroId}
                                className={`flex flex-col items-center gap-1 ${r.posicao === 1 ? "pb-0" : "pb-3"}`}
                              >
                                {r.posicao === 1 && (
                                  <Crown size={16} className="text-[var(--gf-dourado)]" />
                                )}
                                <IniciaisAvatarGf
                                  nome={r.nome}
                                  tamanho={r.posicao === 1 ? 48 : 40}
                                  tom={r.posicao === 1 ? "dourado" : "neutro"}
                                />
                                <span className="max-w-20 truncate text-xs font-medium text-[var(--gf-texto)]">
                                  {r.nome}
                                </span>
                                <span className="text-[11px] text-[var(--gf-texto-sec)]">
                                  {r.total.toLocaleString("pt-BR")} XP
                                </span>
                              </div>
                            ),
                        )}
                      </div>
                    )}
                    <ul className="flex flex-col gap-1.5">
                      {ranking.map((r) => (
                        <li
                          key={r.membroId}
                          className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                            r.membroId === atual.membroId ? "bg-[var(--gf-verde-10)]" : ""
                          }`}
                        >
                          <span className="w-5 shrink-0 text-center text-[var(--gf-texto-sec)]">
                            {r.posicao}
                          </span>
                          <span
                            className={`flex-1 truncate ${r.membroId === atual.membroId ? "font-medium text-[var(--gf-verde)]" : "text-[var(--gf-texto)]"}`}
                          >
                            {r.membroId === atual.membroId ? "Você" : r.nome}
                          </span>
                          <span className="font-medium text-[var(--gf-texto)]">
                            {r.total.toLocaleString("pt-BR")} XP
                          </span>
                        </li>
                      ))}
                    </ul>
                </>
              )}
            </div>
          </CartaoGf>

          <div className="grid gap-2 lg:h-full lg:grid-rows-[119px_1fr]">
            <CartaoGf titulo={<span className="flex items-center gap-2"><BarChart3 size={15} className="text-[var(--gf-verde)]" />Você x próximo colocado</span>}>
              {!acimaDeMim || !minhaPosicaoRanking ? (
                <EstadoVazioGf Icone={Trophy} compacto>
                  {minhaPosicaoRanking
                    ? "Você já está em 1º lugar no período."
                    : "Pontue neste período pra comparar com o próximo colocado."}
                </EstadoVazioGf>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--gf-texto-sec)]">
                    Você está a{" "}
                    <span className="font-semibold text-[var(--gf-verde)]">
                      {(acimaDeMim.total - minhaPosicaoRanking.total).toLocaleString("pt-BR")} XP
                    </span>{" "}
                    do {acimaDeMim.posicao}º lugar
                  </p>
                  {[
                    { linha: minhaPosicaoRanking, rotulo: "Você", destaque: true },
                    { linha: acimaDeMim, rotulo: acimaDeMim.nome, destaque: false },
                  ].map(({ linha, rotulo, destaque }) => (
                    <div key={linha.membroId} className="flex items-center gap-2.5">
                      <IniciaisAvatarGf nome={linha.nome} tamanho={28} tom={destaque ? "verde" : "neutro"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between text-xs">
                          <span
                            className={destaque ? "font-medium text-[var(--gf-verde)]" : "text-[var(--gf-texto)]"}
                          >
                            {rotulo}
                          </span>
                          <span className="text-[var(--gf-texto-sec)]">
                            {linha.total.toLocaleString("pt-BR")} XP
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
                          <div
                            className={`h-full rounded-full ${destaque ? "bg-[var(--gf-verde)]" : "bg-[var(--gf-texto-ter)]"}`}
                            style={{
                              width: `${Math.min(100, (linha.total / acimaDeMim.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CartaoGf>

            <CartaoGf titulo={<span className="flex items-center gap-2"><Zap size={15} className="text-[var(--gf-dourado)]" />Atividade recente</span>} className="flex flex-col">
              <div
                className={`flex min-h-0 flex-1 flex-col overflow-hidden ${!atividadeRecente.length ? "items-center justify-center" : ""}`}
              >
                {!atividadeRecente.length ? (
                  <EstadoVazioGf Icone={Activity} compacto>
                    Nenhuma atividade neste período.
                  </EstadoVazioGf>
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
              </div>
            </CartaoGf>
          </div>

          {/* Lateral direita, ordem obrigatória: Meta mensal → Conquistas → Loja. */}
          <div className="grid gap-2 lg:h-full lg:grid-rows-[103px_128px_1fr]">
            <CartaoGf
              titulo={<span className="flex items-center gap-2"><Target size={15} className="text-[var(--gf-verde)]" />Meta mensal</span>}
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
                <EstadoVazioGf Icone={Target} compacto>
                  Nenhuma meta ativa no momento.
                </EstadoVazioGf>
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
              titulo={<span className="flex items-center gap-2"><Trophy size={15} className="text-[var(--gf-dourado)]" />Conquistas</span>}
              acao={
                <Link
                  href="/gamificacao/jornada"
                  className="text-sm text-[var(--gf-verde)] hover:underline"
                >
                  Ver →
                </Link>
              }
            >
              {!ultimaConquista && !proximaConquista ? (
                <EstadoVazioGf Icone={Award} compacto>
                  Nenhuma conquista ainda.
                </EstadoVazioGf>
              ) : (
                <div className="flex flex-col gap-3">
                  {ultimaConquista && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                        {ultimaConquista.icone ? (
                          <span className="text-sm leading-none">{ultimaConquista.icone}</span>
                        ) : (
                          <Trophy size={14} />
                        )}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[11px] text-[var(--gf-texto-sec)]">
                          Última conquista
                        </span>
                        <span className="truncate text-[var(--gf-texto)]">
                          {ultimaConquista.nome ?? "(conquista removida)"} ·{" "}
                          {tempoDesde(ultimaConquista.desbloqueadaEm)}
                        </span>
                      </div>
                    </div>
                  )}
                  {proximaConquista?.info && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-[var(--gf-texto-sec)]">
                        Próxima conquista
                      </span>
                      <p className="truncate text-sm text-[var(--gf-texto)]">
                        {proximaConquista.info.nome}
                      </p>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
                        <div
                          className="h-full rounded-full bg-[var(--gf-dourado)]"
                          style={{
                            width: `${Math.min(100, (proximaConquista.realizado / proximaConquista.alvo) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-[var(--gf-texto-sec)]">
                        Você está em {proximaConquista.realizado} de {proximaConquista.alvo}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CartaoGf>

            {/* Fecha a coluna, discreta de propósito: sem mais peso visual que
                Meta/Conquistas, só saldo + prévia + acesso à loja completa. */}
            <CartaoGf
              titulo={<span className="flex items-center gap-2"><Gift size={15} className="text-[var(--gf-dourado)]" />Loja</span>}
              acao={
                <Link
                  href="/gamificacao/loja"
                  className="text-sm text-[var(--gf-verde)] hover:underline"
                >
                  Ver loja →
                </Link>
              }
            >
              {!recompensas?.length ? (
                <EstadoVazioGf Icone={Gift} compacto>
                  Nenhuma recompensa disponível.
                </EstadoVazioGf>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-[var(--gf-texto-sec)]">
                    Seu saldo:{" "}
                    <span className="font-semibold text-[var(--gf-texto)]">
                      {meuSaldoMoedas.toLocaleString("pt-BR")} moedas
                    </span>
                  </p>
                  {recompensas.slice(0, 3).map((r) => (
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
