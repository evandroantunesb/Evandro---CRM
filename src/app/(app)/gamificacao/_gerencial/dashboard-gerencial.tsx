import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Activity, Award, Crown, Target, Trophy, Users, Zap } from "lucide-react";
import { formatarMoeda, tempoDesde } from "@/lib/formatacao";
import {
  carregarDadosGerencial,
  type DadosGerencial,
  type MetaGerencial,
} from "@/lib/gamificacao-gerencial";
import type { Vinculo } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PERFIL_GAMIFICACAO, UNIDADE_METRICA_META } from "@/lib/tipos";
import { RankingTabsGf } from "../_compartilhado/ranking-tabs";
import { CartaoGf, EstadoVazioGf, IndicadorKpiGf } from "../_compartilhado/ui";
import "./gerencial.css";

const PERIODOS_VALIDOS = ["mes", "mes-passado"] as const;
type PeriodoGerencial = (typeof PERIODOS_VALIDOS)[number];

function formatarValorMeta(unidade: "moeda" | "quantidade" | "percentual", valor: number) {
  if (unidade === "moeda") return formatarMoeda(valor);
  if (unidade === "percentual") return `${valor.toFixed(1)}%`;
  return Math.round(valor).toLocaleString("pt-BR");
}

const TOM_ICONE_KPI = {
  verde: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  dourado: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
} as const;

/** KPI da visão gerencial: maior e mais legível que a pílula da visão pessoal. */
function KpiGerencial({
  Icone,
  rotulo,
  valor,
  legenda,
  indicador,
  tom,
}: {
  Icone: ComponentType<{ size?: number }>;
  rotulo: string;
  valor: string;
  legenda?: string;
  indicador?: ReactNode;
  tom: keyof typeof TOM_ICONE_KPI;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.4)] md:p-4">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TOM_ICONE_KPI[tom]}`}
      >
        <Icone size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[11px] leading-tight text-[var(--gf-texto-sec)]">{rotulo}</p>
        <p className="mt-1 truncate text-xl font-semibold leading-none text-[var(--gf-texto)] md:text-2xl">
          {valor}
        </p>
        {(indicador || legenda) && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] text-[var(--gf-texto-sec)]">
            {indicador}
            {legenda && <span className="truncate">{legenda}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ListaMetas({ metas }: { metas: MetaGerencial[] }) {
  return (
    <ul className="gf-gerencial-lista">
      {metas.map((m) => {
        const unidade = UNIDADE_METRICA_META[m.metrica];
        const pct = m.progresso.percentual;
        return (
          <li
            key={m.id}
            className="flex flex-col gap-1.5 border-t border-[var(--gf-borda)] py-2.5 text-sm first:border-t-0 first:pt-0"
          >
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-[var(--gf-texto)]">
                {m.membroNome}
              </span>
              <span
                className={`shrink-0 text-xs font-semibold ${pct >= 100 ? "text-[var(--gf-verde)]" : "text-[var(--gf-texto)]"}`}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
            <p className="truncate text-xs text-[var(--gf-texto-sec)]">
              {m.titulo} · {formatarValorMeta(unidade, m.progresso.realizado)} de{" "}
              {formatarValorMeta(unidade, m.valorAlvo)}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--gf-surface-alta)]">
              <div
                className="h-full rounded-full bg-[var(--gf-verde)]"
                style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const OPCOES_PERIODO: { chave: PeriodoGerencial; rotulo: string }[] = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
];

function Conteudo({
  dados,
  periodo,
  periodoRotulo,
}: {
  dados: DadosGerencial;
  periodo: PeriodoGerencial;
  periodoRotulo: string;
}) {
  const daEmpresa = dados.escopo === "empresa";
  const rotuloEscopo = daEmpresa ? "da empresa" : "da equipe";
  const rotuloEscopoRanking = daEmpresa ? "Empresa" : "Sua equipe";

  return (
    <div className="gf-gerencial">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold text-[var(--gf-texto)]">Gamificação</h1>
          <p className="text-sm text-[var(--gf-texto-sec)]">
            {daEmpresa ? "Visão gerencial da empresa" : "Visão gerencial da sua equipe"} ·{" "}
            {periodoRotulo.toLowerCase()}
          </p>
        </div>
        <nav
          aria-label="Período"
          className="flex w-fit gap-1 rounded-lg bg-[var(--gf-surface-alta)] p-1"
        >
          {OPCOES_PERIODO.map((p) => (
            <Link
              key={p.chave}
              href={`/gamificacao?periodo=${p.chave}`}
              aria-current={periodo === p.chave ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                periodo === p.chave
                  ? "bg-[var(--gf-surface)] font-medium text-[var(--gf-texto)] shadow-sm"
                  : "text-[var(--gf-texto-sec)] hover:text-[var(--gf-texto)]"
              }`}
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      {dados.gestorSemEquipe && (
        <CartaoGf>
          <EstadoVazioGf Icone={Users} compacto>
            Você ainda não gerencia nenhuma equipe ativa. Peça ao administrador para vincular você
            como gestor de uma equipe para acompanhar o desempenho dela aqui.
          </EstadoVazioGf>
        </CartaoGf>
      )}

      <div className="gf-gerencial-kpis">
        <KpiGerencial
          Icone={Zap}
          tom="verde"
          rotulo="XP distribuído no período"
          valor={`${dados.xpDistribuido.toLocaleString("pt-BR")} XP`}
          indicador={
            dados.variacaoXpPct != null && (
              <IndicadorKpiGf
                direcao={dados.variacaoXpPct >= 0 ? "alta" : "baixa"}
                texto={`${Math.abs(dados.variacaoXpPct).toFixed(0)}% vs. mês anterior`}
              />
            )
          }
        />
        <KpiGerencial
          Icone={Users}
          tom="neutro"
          rotulo="Participantes pontuando"
          valor={dados.participantes.toLocaleString("pt-BR")}
          legenda="no período"
        />
        <KpiGerencial
          Icone={Target}
          tom="verde"
          rotulo="Metas atingidas"
          valor={`${dados.metasAtingidas}/${dados.metasTotal}`}
          legenda={rotuloEscopo}
        />
        <KpiGerencial
          Icone={Award}
          tom="dourado"
          rotulo="Conquistas no período"
          valor={dados.conquistasPeriodo.toLocaleString("pt-BR")}
          legenda={rotuloEscopo}
        />
      </div>

      <div className="gf-gerencial-rankings">
        {dados.rankings.map((r) => (
          <CartaoGf key={r.perfil} className="gf-gerencial-ranking">
            <RankingTabsGf
              rolagem
              titulo={
                <>
                  <Crown size={15} className="shrink-0 text-[var(--gf-dourado)]" />
                  <span className="truncate">
                    Ranking {ROTULO_PERFIL_GAMIFICACAO[r.perfil]} · {rotuloEscopoRanking}
                  </span>
                </>
              }
              listas={{ semana: r.semana, mes: r.mes, geral: r.geral }}
            />
          </CartaoGf>
        ))}
      </div>

      <div className="gf-gerencial-baixo">
        <CartaoGf
          className="gf-gerencial-metas"
          titulo={
            <span className="flex items-center gap-2">
              <Target size={15} className="text-[var(--gf-verde)]" />
              Metas {rotuloEscopo}
            </span>
          }
          acao={
            <Link href="/gamificacao/metas" className="text-sm text-[var(--gf-verde)] hover:underline">
              Ver →
            </Link>
          }
        >
          {!dados.metas.length ? (
            <EstadoVazioGf Icone={Target} compacto>
              Nenhuma meta ativa neste período.
            </EstadoVazioGf>
          ) : (
            <ListaMetas metas={dados.metas} />
          )}
        </CartaoGf>

        <CartaoGf
          titulo={
            <span className="flex items-center gap-2">
              <Zap size={15} className="text-[var(--gf-verde)]" />
              Atividade recente
            </span>
          }
        >
          {!dados.atividade.length ? (
            <EstadoVazioGf Icone={Activity} compacto>
              Nenhuma atividade neste período.
            </EstadoVazioGf>
          ) : (
            <ul className="gf-gerencial-lista">
              {dados.atividade.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2.5 border-t border-[var(--gf-borda)] py-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${l.xp >= 0 ? "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]" : "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]"}`}
                  >
                    <Zap size={13} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[var(--gf-texto)]">
                      {l.membroNome} · {l.descricao}
                    </span>
                    <span className="text-xs text-[var(--gf-texto-sec)]">
                      {tempoDesde(l.createdAt)}
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
          titulo={
            <span className="flex items-center gap-2">
              <Trophy size={15} className="text-[var(--gf-dourado)]" />
              Conquistas recentes
            </span>
          }
        >
          {!dados.conquistasRecentes.length ? (
            <EstadoVazioGf Icone={Award} compacto>
              Nenhuma conquista desbloqueada ainda.
            </EstadoVazioGf>
          ) : (
            <ul className="gf-gerencial-lista">
              {dados.conquistasRecentes.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2.5 border-t border-[var(--gf-borda)] py-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                    {c.icone ? (
                      <span className="text-sm leading-none">{c.icone}</span>
                    ) : (
                      <Trophy size={14} />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[var(--gf-texto)]">{c.conquistaNome}</span>
                    <span className="truncate text-xs text-[var(--gf-texto-sec)]">
                      {c.membroNome} · {tempoDesde(c.desbloqueadaEm)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CartaoGf>
      </div>
    </div>
  );
}

/**
 * Visão GERENCIAL da Gamificação. admin = empresa inteira; gestor = escopo dele
 * (equipes ativas que ele gere — ver `obterEscopoMembros`). Sem widgets pessoais.
 */
export async function DashboardGerencial({
  atual,
  periodoParam,
}: {
  atual: Vinculo;
  periodoParam?: string;
}) {
  const periodo = PERIODOS_VALIDOS.find((p) => p === periodoParam) ?? "mes";
  const supabase = await criarClienteServidor();
  const dados = await carregarDadosGerencial(supabase, atual, periodo === "mes-passado" ? 1 : 0);

  return (
    <Conteudo
      dados={dados}
      periodo={periodo}
      periodoRotulo={periodo === "mes-passado" ? "Mês passado" : "Este mês"}
    />
  );
}
