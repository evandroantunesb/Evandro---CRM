import { CalendarDays, Target } from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_METRICA_META, UNIDADE_METRICA_META, type MetricaMeta } from "@/lib/tipos";
import { AbasSecao } from "../_compartilhado/abas-secao";
import { formatarValorMeta, ProgressoMetaGf, SituacaoMetaGf } from "../_compartilhado/metas-ui";
import {
  BadgeGf,
  CabecalhoPaginaGf,
  CartaoGf,
  EstadoVazioGf,
  IniciaisAvatarGf,
  PaginaGf,
} from "../_compartilhado/ui";

function formatarData(isoData: string) {
  return new Date(`${isoData}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function MinhasMetas() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const [{ data: linhas }, config] = await Promise.all([
    supabase
      .from("metas")
      .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .order("periodo_fim"),
    carregarConfiguracao(atual.empresaId),
  ]);

  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const metas: Meta[] = (linhas ?? []).map((m) => ({
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
  const progressos = await Promise.all(
    metas.map(async (meta) => calcularProgresso(meta.valorAlvo, await calcularRealizado(supabase, meta), meta.periodoInicio, meta.periodoFim)),
  );
  const batidas = progressos.filter((p) => p.percentual >= 100).length;

  return (
    <PaginaGf largura="larga">
      <AbasSecao secao="desempenho" papel={atual.papel} />
      <CabecalhoPaginaGf
        titulo="Metas"
        descricao="Realizado, alvo e situação de cada meta ativa."
        acao={
          metas.length > 0 && (
            <BadgeGf tom={batidas > 0 ? "positivo" : "neutro"}>
              {batidas} de {metas.length} {metas.length === 1 ? "meta batida" : "metas batidas"}
            </BadgeGf>
          )
        }
      />

      {!metas.length && (
        <CartaoGf>
          <EstadoVazioGf Icone={Target} titulo="Nenhuma meta ativa no momento">
            Quando a administração cadastrar uma meta, ela aparece aqui com o progresso em tempo real.
          </EstadoVazioGf>
        </CartaoGf>
      )}

      <div className="grid gap-4 @min-[760px]:grid-cols-2">
        {metas.map((meta, i) => {
          const progresso = progressos[i];
          const unidade = UNIDADE_METRICA_META[meta.metrica];
          const encerrada = progresso.diasRestantes === 0;
          const pessoa = nomeMembro.get(meta.membroId) ?? "(removido)";

          return (
            <CartaoGf
              key={meta.id}
              titulo={meta.titulo}
              acao={<SituacaoMetaGf percentual={progresso.percentual} diasRestantes={progresso.diasRestantes} />}
              className="flex flex-col"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <IniciaisAvatarGf nome={pessoa} tamanho={40} />
                  <div className="min-w-0">
                    <p className="gf-t-item break-words">{pessoa}</p>
                    <p className="gf-t-aux break-words">
                      {ROTULO_METRICA_META[meta.metrica]}
                      <span className="mx-1.5 text-[var(--gf-texto-ter)]" aria-hidden>
                        •
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={13} aria-hidden />
                        {formatarData(meta.periodoInicio)} – {formatarData(meta.periodoFim)}
                      </span>
                    </p>
                  </div>
                </div>

                <ProgressoMetaGf
                  rotulo={`${pessoa} — ${meta.titulo}`}
                  realizado={formatarValorMeta(unidade, progresso.realizado)}
                  alvo={formatarValorMeta(unidade, meta.valorAlvo)}
                  percentual={progresso.percentual}
                />

                {!encerrada && (
                  <>
                    <p className="text-sm text-[var(--gf-texto)]">
                      {progresso.faltante > 0 ? (
                        <>
                          Faltam <span className="gf-num font-semibold">{formatarValorMeta(unidade, progresso.faltante)}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-[var(--gf-verde)]">Meta atingida</span>
                      )}
                      <span className="mx-1.5 text-[var(--gf-texto-ter)]" aria-hidden>
                        •
                      </span>
                      {progresso.diasRestantes} {progresso.diasRestantes === 1 ? "dia restante" : "dias restantes"}
                    </p>
                    <dl className="flex flex-col gap-1.5 border-t border-[var(--gf-borda)] pt-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--gf-texto-sec)]">Média diária</dt>
                        <dd className="gf-num font-medium text-[var(--gf-texto)]">
                          {formatarValorMeta(unidade, progresso.mediaDiariaRealizada)}
                        </dd>
                      </div>
                      {progresso.necessarioPorDiaRestante !== null && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[var(--gf-texto-sec)]">Necessário por dia</dt>
                          <dd className="gf-num font-medium text-[var(--gf-texto)]">
                            {formatarValorMeta(unidade, progresso.necessarioPorDiaRestante)}
                          </dd>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--gf-texto-sec)]">Projeção final</dt>
                        <dd className="gf-num font-medium text-[var(--gf-texto)]">
                          {formatarValorMeta(unidade, progresso.projecaoFinal)}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            </CartaoGf>
          );
        })}
      </div>
    </PaginaGf>
  );
}
