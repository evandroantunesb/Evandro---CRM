import Link from "next/link";
import {
  Activity,
  Award,
  BarChart3,
  Check,
  Coins,
  Crown,
  Flame,
  ShoppingCart,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { inicioDaSemana, tempoDesde } from "@/lib/formatacao";
import { calcularNivel } from "@/lib/gamificacao";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import type { Vinculo } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { assinarImagensEmLote } from "@/lib/storage-imagens";
import { UNIDADE_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import {
  BarraProgressoGf,
  CartaoGf,
  EstadoVazioGf,
  formatarNumeroGf,
  IndicadorKpiGf,
  IniciaisAvatarGf,
  KpiGf,
  LinhaLancamento,
  LinkAcaoGf,
} from "../_compartilhado/ui";
import { formatarValorMeta, ProgressoMetaGf, SituacaoMetaGf } from "../_compartilhado/metas-ui";
import { RecompensaChipGf } from "../_compartilhado/recompensa-preview";
import { RankingTabsGf } from "../_compartilhado/ranking-tabs";

type RankingLinha = { posicao: number; membroId: string; nome: string; total: number };
type DiaSequencia = { data: string; dia_util: boolean; produtivo: boolean };

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

/**
 * Visão PESSOAL da Gamificação (participantes: vendedor, sdr e demais papéis
 * que não são admin/gestor). Movida sem mudança de comportamento de
 * `gamificacao/page.tsx`, que agora só decide a visão pelo papel.
 */
export async function DashboardPessoal({
  atual,
  periodoParam,
}: {
  atual: Vinculo;
  periodoParam?: string;
}) {
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
    { data: rankingSemanaBruto },
    { data: rankingGeralBruto },
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
    // Abas do card de Ranking (Semana/Mês/Geral) — mesma RPC, janelas
    // diferentes; "Mês" reaproveita o `rankingBruto` já consultado acima.
    supabase.rpc("ranking_gamificacao", {
      p_empresa_id: atual.empresaId,
      p_perfil: perfil,
      p_desde: inicioSemanaIso,
    }),
    supabase.rpc("ranking_gamificacao", {
      p_empresa_id: atual.empresaId,
      p_perfil: perfil,
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
      .select("id, nome, descricao, custo_moedas, imagem_caminho")
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
  // Miniaturas da prévia da loja: uma única chamada assina as (até 3) imagens exibidas.
  const urlsImagemRecompensa = await assinarImagensEmLote(
    supabase,
    "recompensas",
    (recompensas ?? []).slice(0, 3).map((r) => r.imagem_caminho),
  );

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

  // Ranking (XP ativo, por perfil/período) + variação de posição esta semana ----
  const niveisNormalizados = (niveis ?? []).map((n) => ({
    nivel: n.nivel,
    nome: n.nome,
    xpMinimo: n.xp_minimo,
  }));
  const rankingCompleto = construirRanking(rankingBruto, nomeMembro);
  const ranking = rankingCompleto.slice(0, 5);
  // Abas do card de Ranking — mesma fonte, três janelas diferentes.
  const rankingPorAba = {
    semana: construirRanking(rankingSemanaBruto, nomeMembro).slice(0, 5),
    mes: ranking,
    geral: construirRanking(rankingGeralBruto, nomeMembro).slice(0, 5),
  };
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
    <div className="gf-pessoal">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gf-t-pagina">Gamificação</h1>
          <p className="gf-t-aux mt-1">Desempenho, evolução e conquistas em um só lugar.</p>
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
      </header>

      <div className="gf-kpis">
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
          tom="dourado"
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
        <KpiGf Icone={Target} valor={`${metasAtingidas}/${metasTotal}`} legenda="Metas atingidas" />
        <KpiGf
          Icone={Award}
          valor={totalConquistasDesbloqueadas.toLocaleString("pt-BR")}
          legenda="Conquistas"
          tom="dourado"
          indicador={
            conquistasNovasPeriodo > 0 && (
              <span className="text-xs font-semibold text-[var(--gf-verde)]">
                +{conquistasNovasPeriodo} no período
              </span>
            )
          }
        />
      </div>

      {/* Hero: posição (largura maior), nível e sequência. Altura pelo conteúdo. */}
      <div className="gf-hero">
        <CartaoGf
          destaque
          className="gf-hero-posicao @container relative min-h-[10.5rem] overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(15,15,16,0.88), rgba(15,15,16,0.5)), url(/gamificacao/fundo-minha-posicao.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {!minhaPosicaoRanking ? (
            <EstadoVazioGf Icone={Trophy} compacto>
              Pontue neste período pra entrar no ranking.
            </EstadoVazioGf>
          ) : (
            <div className="relative flex h-full min-h-[8.5rem] flex-col justify-between gap-5 @min-[400px]:flex-row @min-[400px]:items-center">
              <div className="min-w-0">
                <p className="gf-t-rotulo flex items-center gap-1.5">
                  <Trophy size={14} className="shrink-0 text-[var(--gf-dourado)]" aria-hidden />
                  Minha posição
                </p>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="gf-t-kpi-lg">{`#${minhaPosicaoRanking.posicao}`}</span>
                  <span className="text-base text-[var(--gf-texto-sec)]">
                    {periodo === "mes" ? "no ranking do mês" : "no ranking do período"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--gf-texto)]">
                  <span className="gf-num font-semibold">
                    {minhaPosicaoRanking.total.toLocaleString("pt-BR")} XP
                  </span>{" "}
                  <span className="text-[var(--gf-texto-sec)]">no período</span>
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
                <div className="shrink-0 rounded-lg border border-[var(--gf-borda)] bg-[rgb(10_14_12/70%)] px-4 py-3 @min-[400px]:max-w-[17rem]">
                  <p className="gf-t-micro">Próxima posição</p>
                  <p className="gf-t-kpi-sm text-[var(--gf-verde)]">
                    {(acimaDeMim.total - minhaPosicaoRanking.total).toLocaleString("pt-BR")} XP
                  </p>
                  <p className="gf-t-aux mt-0.5">
                    pra alcançar <span className="font-semibold text-[var(--gf-texto)]">{acimaDeMim.nome}</span> (
                    {acimaDeMim.posicao}º lugar)
                  </p>
                </div>
              )}
            </div>
          )}
        </CartaoGf>

        <CartaoGf destaque className="flex flex-col justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center bg-[var(--gf-verde-10)] font-titulo text-xl font-bold text-[var(--gf-verde)] [clip-path:polygon(25%_5%,75%_5%,100%_50%,75%_95%,25%_95%,0_50%)] ring-1 ring-[var(--gf-verde)]/60 drop-shadow-[0_0_8px_rgba(52,211,153,.25)]"
            >
              {meuNivel.nivel}
            </span>
            <div className="min-w-0">
              <p className="gf-t-rotulo">Meu nível</p>
              <p className="gf-t-item mt-0.5 text-base">{meuNivel.nome ?? `Nível ${meuNivel.nivel}`}</p>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="gf-num font-semibold text-[var(--gf-texto)]">
                {meuTotalXp.toLocaleString("pt-BR")} XP
              </span>
              {proximoNivel && (
                <span className="text-[var(--gf-texto-sec)]">
                  Faltam {(proximoNivel.xpMinimo - meuTotalXp).toLocaleString("pt-BR")} XP p/ nível{" "}
                  {proximoNivel.nivel}
                </span>
              )}
            </div>
            <BarraProgressoGf
              valor={progressoNivel}
              rotulo={proximoNivel ? `Progresso até o nível ${proximoNivel.nivel}` : "Nível máximo alcançado"}
              tamanho="lg"
              className="mt-2"
            />
            {!proximoNivel && <p className="gf-t-aux mt-1.5">Nível máximo alcançado.</p>}
          </div>
          <LinkAcaoGf href="/gamificacao/jornada">Ver jornada completa</LinkAcaoGf>
        </CartaoGf>

        <CartaoGf destaque className="flex flex-col justify-between gap-4">
          <p className="gf-t-rotulo flex items-center gap-1.5">
            <Flame size={16} className="text-[var(--gf-verde)]" aria-hidden />
            Sequência
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="gf-t-kpi">{diasSequencia}</span>
            <span className="text-sm text-[var(--gf-texto-sec)]">
              dia{diasSequencia === 1 ? "" : "s"} produtivo{diasSequencia === 1 ? "" : "s"} consecutivo
              {diasSequencia === 1 ? "" : "s"}
            </span>
          </p>
          {semanaSequencia.length > 0 && (
            <ol aria-label="Última semana" className="grid grid-cols-7 gap-1">
              {semanaSequencia.map((dia, i) => {
                const rotulo = ROTULOS_DIA_SEMANA[i] ?? "";
                const estado = dia.produtivo ? "produtivo" : dia.dia_util ? "sem produção" : "não útil";
                return (
                  <li
                    key={dia.data}
                    aria-label={`${rotulo}: ${estado}`}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="gf-t-micro" aria-hidden>
                      {rotulo}
                    </span>
                    <span
                      aria-hidden
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        dia.produtivo
                          ? "bg-[var(--gf-verde)] text-[var(--gf-on-verde)]"
                          : dia.dia_util
                            ? "border-2 border-[var(--gf-neutro-barra)]"
                            : "bg-[var(--gf-trilha)]"
                      }`}
                    >
                      {dia.produtivo && <Check size={14} strokeWidth={3} />}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CartaoGf>
      </div>

      {/* Área principal: Ranking (maior), centro e lateral direita. Sem alturas fixas. */}
      <div className="gf-area">
        <CartaoGf
          titulo="Ranking"
          Icone={Crown}
          tomIcone="dourado"
          acao={<LinkAcaoGf href="/gamificacao/ranking">Ver completo</LinkAcaoGf>}
          className="flex flex-col"
        >
          <RankingTabsGf listas={rankingPorAba} membroAtualId={atual.membroId} />
        </CartaoGf>

        <div className="gf-col">
          <CartaoGf titulo="Você x próximo colocado" Icone={BarChart3}>
            {!acimaDeMim || !minhaPosicaoRanking ? (
              <EstadoVazioGf Icone={Trophy} compacto>
                {minhaPosicaoRanking
                  ? "Você já está em 1º lugar no período."
                  : "Pontue neste período pra comparar com o próximo colocado."}
              </EstadoVazioGf>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-[var(--gf-texto-sec)]">
                  Você está a{" "}
                  <span className="gf-num text-base font-bold text-[var(--gf-verde)]">
                    {(acimaDeMim.total - minhaPosicaoRanking.total).toLocaleString("pt-BR")} XP
                  </span>{" "}
                  do {acimaDeMim.posicao}º lugar
                </p>
                {[
                  { linha: minhaPosicaoRanking, rotulo: "Você", destaque: true },
                  { linha: acimaDeMim, rotulo: acimaDeMim.nome, destaque: false },
                ].map(({ linha, rotulo, destaque }) => (
                  <div key={linha.membroId} className="flex items-center gap-3">
                    <IniciaisAvatarGf nome={linha.nome} tamanho={36} tom={destaque ? "verde" : "neutro"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span
                          className={`min-w-0 break-words ${destaque ? "font-semibold text-[var(--gf-verde)]" : "font-medium text-[var(--gf-texto)]"}`}
                        >
                          {rotulo}
                        </span>
                        <span className="gf-num shrink-0 font-semibold whitespace-nowrap text-[var(--gf-texto)]">
                          {linha.total.toLocaleString("pt-BR")} XP
                        </span>
                      </div>
                      <BarraProgressoGf
                        valor={(linha.total / acimaDeMim.total) * 100}
                        rotulo={`XP de ${destaque ? "você" : acimaDeMim.nome}`}
                        tom={destaque ? "verde" : "neutro"}
                        className="mt-2"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CartaoGf>

          <CartaoGf titulo="Atividade recente" Icone={Zap} className="flex flex-col">
            {!atividadeRecente.length ? (
              <EstadoVazioGf Icone={Activity} compacto>
                Nenhuma atividade neste período.
              </EstadoVazioGf>
            ) : (
              <ul className="flex flex-col">
                {atividadeRecente.map((l) => (
                  <LinhaLancamento
                    key={l.id}
                    autor={nomeMembro.get(l.membro_id) ?? "(removido)"}
                    descricao={l.descricao || "Ponto lançado"}
                    tempo={tempoDesde(l.created_at)}
                    xp={l.xp}
                    Icone={Zap}
                  />
                ))}
              </ul>
            )}
          </CartaoGf>
        </div>

        {/* Lateral direita, ordem obrigatória: Meta mensal → Conquistas → Loja. */}
        <div className="gf-col gf-col-lateral">
          <CartaoGf
            titulo="Meta mensal"
            Icone={Target}
            acao={<LinkAcaoGf href="/gamificacao/metas">Ver</LinkAcaoGf>}
          >
            {!metaPrincipal || !unidadeMetaPrincipal ? (
              <EstadoVazioGf Icone={Target} compacto>
                Nenhuma meta ativa no momento.
              </EstadoVazioGf>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="gf-t-item min-w-0 break-words">{metaPrincipal.meta.titulo}</p>
                  <SituacaoMetaGf
                    percentual={metaPrincipal.progresso.percentual}
                    diasRestantes={metaPrincipal.progresso.diasRestantes}
                  />
                </div>
                <ProgressoMetaGf
                  rotulo={metaPrincipal.meta.titulo}
                  realizado={formatarValorMeta(unidadeMetaPrincipal, metaPrincipal.progresso.realizado)}
                  alvo={formatarValorMeta(unidadeMetaPrincipal, metaPrincipal.meta.valorAlvo)}
                  percentual={metaPrincipal.progresso.percentual}
                />
                {metasComProgresso.length > 1 && (
                  <p className="gf-t-micro">
                    +{metasComProgresso.length - 1} outra{metasComProgresso.length - 1 === 1 ? "" : "s"} meta
                    {metasComProgresso.length - 1 === 1 ? "" : "s"} ativa
                    {metasComProgresso.length - 1 === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            )}
          </CartaoGf>

          <CartaoGf
            titulo="Conquistas"
            Icone={Trophy}
            tomIcone="dourado"
            acao={<LinkAcaoGf href="/gamificacao/jornada">Ver</LinkAcaoGf>}
          >
            {!ultimaConquista && !proximaConquista ? (
              <EstadoVazioGf Icone={Award} compacto>
                Nenhuma conquista ainda.
              </EstadoVazioGf>
            ) : (
              <div className="flex flex-col gap-4">
                {ultimaConquista && (
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                      {ultimaConquista.icone ? (
                        <span className="text-lg leading-none">{ultimaConquista.icone}</span>
                      ) : (
                        <Trophy size={18} aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="gf-t-micro">Última conquista</p>
                      <p className="gf-t-item break-words">
                        {ultimaConquista.nome ?? "(conquista removida)"}
                      </p>
                      <p className="gf-t-micro">{tempoDesde(ultimaConquista.desbloqueadaEm)}</p>
                    </div>
                  </div>
                )}
                {proximaConquista?.info && (
                  <div className="flex flex-col gap-1.5">
                    <p className="gf-t-micro">Próxima conquista</p>
                    <p className="gf-t-item break-words">{proximaConquista.info.nome}</p>
                    <BarraProgressoGf
                      valor={(proximaConquista.realizado / proximaConquista.alvo) * 100}
                      rotulo={`Progresso para ${proximaConquista.info.nome}`}
                      tom="dourado"
                    />
                    <p className="gf-t-aux">
                      Você está em{" "}
                      <span className="gf-num font-semibold text-[var(--gf-texto)]">
                        {proximaConquista.realizado} de {proximaConquista.alvo}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </CartaoGf>

          <CartaoGf
            titulo="Loja"
            Icone={ShoppingCart}
            tomIcone="dourado"
            acao={<LinkAcaoGf href="/gamificacao/loja">Ver loja</LinkAcaoGf>}
          >
            {!recompensas?.length ? (
              <EstadoVazioGf Icone={ShoppingCart} compacto>
                Nenhuma recompensa disponível.
              </EstadoVazioGf>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="gf-t-micro">Seu saldo</p>
                    <p className="gf-num mt-0.5 flex items-baseline gap-1.5">
                      <span className="gf-t-kpi-sm">{formatarNumeroGf(meuSaldoMoedas)}</span>
                      <span className="text-sm text-[var(--gf-texto-sec)]">moedas</span>
                    </p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                    <Coins size={20} aria-hidden />
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {recompensas.slice(0, 3).map((r) => (
                    <RecompensaChipGf
                      key={r.id}
                      saldo={meuSaldoMoedas}
                      recompensa={{
                        id: r.id,
                        nome: r.nome,
                        custoMoedas: r.custo_moedas,
                        imagemUrl: r.imagem_caminho ? (urlsImagemRecompensa.get(r.imagem_caminho) ?? null) : null,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </CartaoGf>
        </div>
      </div>
    </div>
  );
}
