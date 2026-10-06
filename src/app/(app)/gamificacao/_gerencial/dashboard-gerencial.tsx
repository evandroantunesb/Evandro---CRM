import type { ComponentType, ReactNode } from "react";
import { Activity, Award, Crown, Target, Trophy, Users, Zap } from "lucide-react";
import { tempoDesde } from "@/lib/formatacao";
import {
  carregarDadosGerencial,
  type DadosGerencial,
  type MetaGerencial,
} from "@/lib/gamificacao-gerencial";
import type { Vinculo } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PERFIL_GAMIFICACAO, ROTULO_METRICA_META, UNIDADE_METRICA_META } from "@/lib/tipos";
import { formatarValorMeta, ProgressoMetaGf, SituacaoMetaGf } from "../_compartilhado/metas-ui";
import { RankingTabsGf } from "../_compartilhado/ranking-tabs";
import {
  CabecalhoPaginaGf,
  CartaoGf,
  EstadoVazioGf,
  IndicadorKpiGf,
  IniciaisAvatarGf,
  LinhaLancamento,
  LinkAcaoGf,
  SeletorSegmentadoGf,
} from "../_compartilhado/ui";

const PERIODOS_VALIDOS = ["mes", "mes-passado"] as const;
type PeriodoGerencial = (typeof PERIODOS_VALIDOS)[number];

const TOM_ICONE_KPI = {
  verde: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  dourado: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
} as const;

/** KPI da visão gerencial: rótulo completo (quebra linha), valor grande e contexto abaixo. */
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
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TOM_ICONE_KPI[tom]}`}>
          <Icone size={18} />
        </span>
        <p className="gf-t-aux min-w-0 leading-tight">{rotulo}</p>
      </div>
      <div>
        <p className="gf-t-kpi">{valor}</p>
        {(indicador || legenda) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {indicador}
            {legenda && <span className="gf-t-micro">{legenda}</span>}
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
        return (
          <li
            key={m.id}
            className="flex flex-col gap-3 border-t border-[var(--gf-borda)] py-4 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <IniciaisAvatarGf nome={m.membroNome} tamanho={36} src={m.avatarUrl} />
                <div className="min-w-0">
                  <p className="gf-t-item break-words">{m.membroNome}</p>
                  <p className="gf-t-aux break-words">
                    {m.titulo} · {ROTULO_METRICA_META[m.metrica]}
                  </p>
                </div>
              </div>
              <SituacaoMetaGf percentual={m.progresso.percentual} diasRestantes={m.progresso.diasRestantes} />
            </div>
            <ProgressoMetaGf
              rotulo={`${m.membroNome} — ${m.titulo}`}
              realizado={formatarValorMeta(unidade, m.progresso.realizado)}
              alvo={formatarValorMeta(unidade, m.valorAlvo)}
              percentual={m.progresso.percentual}
            />
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
      <CabecalhoPaginaGf
        titulo="Gamificação"
        descricao={`${daEmpresa ? "Visão gerencial da empresa" : "Visão gerencial da sua equipe"} · ${periodoRotulo.toLowerCase()}`}
        acao={
          <SeletorSegmentadoGf
            rotulo="Período"
            opcoes={OPCOES_PERIODO.map((p) => ({
              href: `/gamificacao?periodo=${p.chave}`,
              rotulo: p.rotulo,
              ativo: periodo === p.chave,
            }))}
          />
        }
      />

      {dados.gestorSemEquipe && (
        <CartaoGf>
          <EstadoVazioGf Icone={Users} compacto>
            Você ainda não gerencia nenhuma equipe ativa. Peça ao administrador para vincular você
            como gestor de uma equipe para acompanhar o desempenho dela aqui.
          </EstadoVazioGf>
        </CartaoGf>
      )}

      <div className="gf-kpis">
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
                  <Crown size={18} className="shrink-0 text-[var(--gf-dourado)]" aria-hidden />
                  <span className="min-w-0">
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
          titulo={`Metas ${rotuloEscopo}`}
          Icone={Target}
          acao={<LinkAcaoGf href="/gamificacao/metas">Ver</LinkAcaoGf>}
        >
          {!dados.metas.length ? (
            <EstadoVazioGf Icone={Target} compacto>
              Nenhuma meta ativa neste período.
            </EstadoVazioGf>
          ) : (
            <ListaMetas metas={dados.metas} />
          )}
        </CartaoGf>

        <CartaoGf titulo="Atividade recente" Icone={Zap}>
          {!dados.atividade.length ? (
            <EstadoVazioGf Icone={Activity} compacto>
              Nenhuma atividade neste período.
            </EstadoVazioGf>
          ) : (
            <ul className="gf-gerencial-lista">
              {dados.atividade.map((l) => (
                <LinhaLancamento
                  key={l.id}
                  autor={l.membroNome}
                  avatarUrl={l.avatarUrl}
                  descricao={l.descricao}
                  tempo={tempoDesde(l.createdAt)}
                  xp={l.xp}
                  Icone={Zap}
                />
              ))}
            </ul>
          )}
        </CartaoGf>

        <CartaoGf titulo="Conquistas recentes" Icone={Trophy} tomIcone="dourado">
          {!dados.conquistasRecentes.length ? (
            <EstadoVazioGf Icone={Award} compacto>
              Nenhuma conquista desbloqueada ainda.
            </EstadoVazioGf>
          ) : (
            <ul className="gf-gerencial-lista">
              {dados.conquistasRecentes.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 border-t border-[var(--gf-borda)] py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                    {c.icone ? (
                      <span className="text-lg leading-none">{c.icone}</span>
                    ) : (
                      <Trophy size={18} aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="gf-t-item break-words">{c.conquistaNome}</p>
                    <p className="gf-t-aux break-words">
                      {c.avatarUrl && (
                        <span className="mr-1.5 inline-flex align-text-bottom">
                          <IniciaisAvatarGf nome={c.membroNome} tamanho={16} src={c.avatarUrl} />
                        </span>
                      )}
                      {c.membroNome} · {tempoDesde(c.desbloqueadaEm)}
                    </p>
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
