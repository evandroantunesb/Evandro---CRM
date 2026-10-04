import Link from "next/link";
import { FileCheck2, Target, Trophy, Wallet, Zap } from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda, tempoDesde } from "@/lib/formatacao";
import { calcularNivel } from "@/lib/gamificacao";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { MetricaMeta } from "@/lib/tipos";
import { CartaoGf, EstadoVazioGf, KpiGf, LinhaLancamento } from "./_compartilhado/ui";
import { CartaoRecompensa } from "./loja/formulario";

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
  return { inicio, fimExclusivo, inicioIso: inicio.toISOString(), fimExclusivoIso: fimExclusivo.toISOString() };
}

function paraDataCurta(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Variação percentual vs. o período anterior. Sem baseline real (anterior = 0), não inventa uma % — retorna null. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export default async function GamificacaoDashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { atual } = await exigirPapel();
  const { periodo: periodoParam } = await searchParams;
  const periodo = (PERIODOS.some((p) => p.chave === periodoParam) ? periodoParam : "mes") as PeriodoChave;
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
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).eq("ativa", true).order("xp_minimo"),
    supabase.from("point_ledger").select("xp").eq("membro_id", atual.membroId).eq("estornado", false).limit(20000),
    supabase.from("point_ledger").select("moedas").eq("membro_id", atual.membroId).eq("estornado", false).limit(20000),
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
  const receitaPeriodo = (negociosPeriodo ?? []).reduce((s, n) => s + (n.valor ?? 0), 0);
  const receitaAnterior = (negociosAnterior ?? []).reduce((s, n) => s + (n.valor ?? 0), 0);

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
    metas.map(async (m) => calcularProgresso(m.valorAlvo, await calcularRealizado(supabase, m), m.periodoInicio, m.periodoFim)),
  );
  const progressoMedioMetas = progressosMetas.length
    ? progressosMetas.reduce((s, p) => s + Math.min(p.percentual, 100), 0) / progressosMetas.length
    : null;

  // Evolução de XP (acumulado por dia no período) --------------------------
  const diasNoPeriodo = Math.round((atualMes.fimExclusivo.getTime() - atualMes.inicio.getTime()) / 86_400_000);
  const porDia = new Array(diasNoPeriodo).fill(0) as number[];
  for (const l of pontosPeriodo ?? []) {
    const dia = Math.floor((new Date(l.created_at).getTime() - atualMes.inicio.getTime()) / 86_400_000);
    if (dia >= 0 && dia < diasNoPeriodo) porDia[dia] += l.xp;
  }
  const hoje = new Date();
  const diasComDados = periodo === "mes" ? Math.floor((hoje.getTime() - atualMes.inicio.getTime()) / 86_400_000) + 1 : diasNoPeriodo;
  const serieAcumulada = porDia.slice(0, Math.max(2, Math.min(diasComDados, diasNoPeriodo))).reduce<number[]>((acc, v) => {
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
  const niveisNormalizados = (niveis ?? []).map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo }));
  const ranking = (rankingBruto ?? [])
    .filter((l) => nomeMembro.has(l.membro_id))
    .sort((a, b) => b.total_xp - a.total_xp)
    .slice(0, 5)
    .map((l, i) => ({ posicao: i + 1, membroId: l.membro_id, nome: nomeMembro.get(l.membro_id)!, total: l.total_xp }));

  // Meu nível: sempre XP ativo da vida toda, nunca o total filtrado do
  // ranking (era a origem de dois níveis diferentes pra mesma pessoa —
  // corrigido via fonte única em calcularNivel).
  const meuTotalXp = (xpTotais ?? []).reduce((s, l) => s + l.xp, 0);
  const meuSaldoMoedas = (moedasTotais ?? []).reduce((s, l) => s + l.moedas, 0);
  const { nivel: meuNivelNumero, nome: meuNivelNome, proximoNivel, progresso: progressoNivel } = calcularNivel(niveisNormalizados, meuTotalXp);
  const meuNivel = { nivel: meuNivelNumero, nome: meuNivelNome };

  // Minhas conquistas + atividade recente ---------------------------------
  const nomeConquista = new Map((conquistas ?? []).map((c) => [c.id, c]));
  const minhasConquistas = (desbloqueadas ?? []).map((d) => ({
    conquistaId: d.conquista_id,
    desbloqueadaEm: d.desbloqueada_em,
    ...nomeConquista.get(d.conquista_id),
  }));

  const atividadeRecente = (pontosPeriodo ?? []).slice(0, 8);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--gf-texto)]">Gamificação</h1>
          <p className="text-sm text-[var(--gf-texto-sec)]">Acompanhe metas, XP, ranking e desempenho da equipe.</p>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiGf
          Icone={Zap}
          valor={`${totalXpPeriodo.toLocaleString("pt-BR")} XP`}
          legenda="XP acumulado"
          variacaoPct={variacao(totalXpPeriodo, totalXpAnterior)}
        />
        <KpiGf
          Icone={Target}
          valor={progressoMedioMetas === null ? "—" : `${progressoMedioMetas.toFixed(0)}%`}
          legenda={metas.length ? `Progresso médio de ${metas.length} meta${metas.length === 1 ? "" : "s"} ativa${metas.length === 1 ? "" : "s"}` : "Nenhuma meta ativa"}
        />
        <KpiGf
          Icone={FileCheck2}
          valor={contratosPeriodo.toLocaleString("pt-BR")}
          legenda="Contratos assinados"
          variacaoPct={variacao(contratosPeriodo, contratosAnterior)}
        />
        <KpiGf
          Icone={Wallet}
          valor={formatarMoeda(receitaPeriodo)}
          legenda="Receita gerada"
          variacaoPct={variacao(receitaPeriodo, receitaAnterior)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoGf titulo="Evolução de XP" acao={<Link href="/gamificacao/extrato" className="text-sm text-[var(--gf-verde)] hover:underline">Ver extrato →</Link>}>
          {serieAcumulada.length < 2 ? (
            <EstadoVazioGf>Sem dados suficientes neste período.</EstadoVazioGf>
          ) : (
            <>
              <p className="text-sm text-[var(--gf-texto-sec)]">
                <span className="text-lg font-semibold text-[var(--gf-texto)]">{totalXpPeriodo.toLocaleString("pt-BR")}</span> XP no período
              </p>
              <GraficoLinha serie={serieAcumulada} />
            </>
          )}
        </CartaoGf>

        <CartaoGf titulo="Ações que mais geram XP">
          {!topAcoes.length ? <EstadoVazioGf>Nenhum ponto lançado neste período.</EstadoVazioGf> : <GraficoBarras itens={topAcoes} />}
        </CartaoGf>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoGf titulo="Ranking da equipe" acao={<Link href="/gamificacao/ranking" className="text-sm text-[var(--gf-verde)] hover:underline">Ver ranking completo →</Link>}>
          {!ranking.length ? (
            <EstadoVazioGf>Ninguém pontuou neste período ainda.</EstadoVazioGf>
          ) : (
            <ul className="flex flex-col gap-2">
              {ranking.map((r) => (
                <li
                  key={r.membroId}
                  className={`flex items-center gap-3 text-sm ${r.membroId === atual.membroId ? "rounded-lg bg-[var(--gf-surface-alta)] p-1.5" : ""}`}
                >
                  <span className="flex w-5 shrink-0 items-center justify-center">
                    {r.posicao === 1 ? <Trophy size={14} className="text-[var(--gf-dourado)]" /> : <span className="text-[var(--gf-texto-sec)]">{r.posicao}º</span>}
                  </span>
                  <span className="flex-1 truncate text-[var(--gf-texto)]">{r.nome}</span>
                  <span className="font-medium text-[var(--gf-texto)]">{r.total.toLocaleString("pt-BR")} XP</span>
                </li>
              ))}
            </ul>
          )}
        </CartaoGf>

        <CartaoGf titulo="Meu nível atual" acao={<Link href="/gamificacao/jornada" className="text-sm text-[var(--gf-verde)] hover:underline">Ver todos os níveis →</Link>}>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-[var(--gf-texto)]">
              {meuNivel.nivel}
              {meuNivel.nome && <span className="ml-2 text-sm font-normal text-[var(--gf-texto-sec)]">{meuNivel.nome}</span>}
            </span>
            {proximoNivel && (
              <span className="text-xs text-[var(--gf-texto-sec)]">
                {meuTotalXp.toLocaleString("pt-BR")} / {proximoNivel.xpMinimo.toLocaleString("pt-BR")} XP
              </span>
            )}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
            <div className="h-full rounded-full bg-[var(--gf-verde)]" style={{ width: `${progressoNivel}%` }} />
          </div>
          {proximoNivel && <p className="mt-1 text-xs text-[var(--gf-texto-sec)]">Próximo nível: {proximoNivel.nome ?? `Nível ${proximoNivel.nivel}`}</p>}
        </CartaoGf>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoGf titulo="Minhas conquistas" acao={<Link href="/gamificacao/jornada" className="text-sm text-[var(--gf-verde)] hover:underline">Ver todas →</Link>}>
          {!minhasConquistas.length ? (
            <EstadoVazioGf>Nenhuma conquista desbloqueada ainda.</EstadoVazioGf>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {minhasConquistas.map((c) => (
                <li key={c.conquistaId} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                    {c.icone ? <span className="text-base leading-none">{c.icone}</span> : <Trophy size={16} />}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-[var(--gf-texto)]">{c.nome ?? "(conquista removida)"}</span>
                    <span className="text-xs text-[var(--gf-texto-sec)]">Desbloqueada {tempoDesde(c.desbloqueadaEm)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CartaoGf>

        <CartaoGf titulo="Atividade recente">
          {!atividadeRecente.length ? (
            <EstadoVazioGf>Nenhuma atividade neste período.</EstadoVazioGf>
          ) : (
            <ul className="flex flex-col">
              {atividadeRecente.map((l) => (
                <LinhaLancamento
                  key={l.id}
                  descricao={`${nomeMembro.get(l.membro_id) ?? "(removido)"} · ${l.descricao || "Ponto lançado"}`}
                  tempo={tempoDesde(l.created_at)}
                  xp={l.xp}
                  moedas={l.moedas}
                />
              ))}
            </ul>
          )}
        </CartaoGf>
      </div>

      <CartaoGf titulo="Loja de recompensas" acao={<Link href="/gamificacao/loja" className="text-sm text-[var(--gf-verde)] hover:underline">Ver catálogo completo →</Link>}>
        {!recompensas?.length ? (
          <EstadoVazioGf>Nenhuma recompensa disponível no momento.</EstadoVazioGf>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {recompensas.map((r) => (
              <CartaoRecompensa
                key={r.id}
                recompensa={{ id: r.id, nome: r.nome, descricao: r.descricao, custoMoedas: r.custo_moedas }}
                saldo={meuSaldoMoedas}
              />
            ))}
          </div>
        )}
      </CartaoGf>
    </div>
  );
}

function GraficoLinha({ serie }: { serie: number[] }) {
  const largura = 100;
  const altura = 32;
  const maxValor = Math.max(1, ...serie);
  const passoX = largura / (serie.length - 1);
  const pontos = serie.map((v, i) => `${(i * passoX).toFixed(2)},${(altura - (v / maxValor) * altura).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-2 h-28 w-full">
      <polyline points={pontos} fill="none" stroke="var(--gf-verde)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function GraficoBarras({ itens }: { itens: { rotulo: string; total: number }[] }) {
  const maxValor = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
      {itens.map((item) => (
        <div key={item.rotulo} className="flex h-full flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--gf-texto)]">{item.total.toLocaleString("pt-BR")}</span>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-t bg-[var(--gf-verde)]" style={{ height: `${Math.max(4, (item.total / maxValor) * 100)}%` }} />
          </div>
          <span className="w-full truncate text-center text-[11px] text-[var(--gf-texto-sec)]" title={item.rotulo}>
            {item.rotulo}
          </span>
        </div>
      ))}
    </div>
  );
}
