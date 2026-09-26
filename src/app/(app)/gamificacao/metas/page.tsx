import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda } from "@/lib/formatacao";
import { calcularProgresso, limitesPeriodo, type Meta } from "@/lib/metas";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";
import { ROTULO_METRICA_META, UNIDADE_METRICA_META, type MetricaMeta } from "@/lib/tipos";

function formatarValor(unidade: "moeda" | "quantidade" | "percentual", valor: number) {
  if (unidade === "moeda") return formatarMoeda(valor);
  if (unidade === "percentual") return `${valor.toFixed(1)}%`;
  return Math.round(valor).toLocaleString("pt-BR");
}

function formatarData(isoData: string) {
  return new Date(`${isoData}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Realizado de uma meta: consulta negócios/tarefas do colaborador no período, respeitando o RLS de sempre. */
async function calcularRealizado(supabase: SupabaseServidor, meta: Meta) {
  const { inicioIso, fimExclusivoIso } = limitesPeriodo(meta.periodoInicio, meta.periodoFim);

  if (meta.metrica === "receita" || meta.metrica === "negocios_ganhos") {
    const { data } = await supabase
      .from("negocios")
      .select("valor")
      .eq("responsavel_id", meta.membroId)
      .eq("status", "ganho")
      .gte("fechado_em", inicioIso)
      .lt("fechado_em", fimExclusivoIso)
      .limit(10000);
    const linhas = data ?? [];
    return meta.metrica === "receita" ? linhas.reduce((soma, n) => soma + (n.valor ?? 0), 0) : linhas.length;
  }

  if (meta.metrica === "conversao") {
    const { data } = await supabase
      .from("negocios")
      .select("status")
      .eq("responsavel_id", meta.membroId)
      .in("status", ["ganho", "perdido"])
      .gte("fechado_em", inicioIso)
      .lt("fechado_em", fimExclusivoIso)
      .limit(10000);
    const linhas = data ?? [];
    const ganhos = linhas.filter((n) => n.status === "ganho").length;
    return linhas.length > 0 ? (ganhos / linhas.length) * 100 : 0;
  }

  // reunioes | tarefas_concluidas
  let consulta = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("responsavel_id", meta.membroId)
    .not("concluida_em", "is", null)
    .gte("concluida_em", inicioIso)
    .lt("concluida_em", fimExclusivoIso);
  if (meta.metrica === "reunioes") consulta = consulta.eq("tipo", "reuniao");
  const { count } = await consulta;
  return count ?? 0;
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
    membroId: m.membro_id,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    valorAlvo: m.valor_alvo,
    ativa: m.ativa,
  }));
  const progressos = await Promise.all(
    metas.map(async (meta) => calcularProgresso(meta.valorAlvo, await calcularRealizado(supabase, meta), meta.periodoInicio, meta.periodoFim)),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Metas</h1>

      {!metas.length && (
        <Cartao>
          <p className="text-sm text-zinc-600">Nenhuma meta ativa no momento.</p>
        </Cartao>
      )}

      {metas.map((meta, i) => {
        const progresso = progressos[i];
        const unidade = UNIDADE_METRICA_META[meta.metrica];
        const percentualBarra = Math.min(Math.max(progresso.percentual, 0), 100);
        const encerrada = progresso.diasRestantes === 0;

        return (
          <Cartao key={meta.id} titulo={meta.titulo}>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-zinc-600">
                <span>
                  {nomeMembro.get(meta.membroId) ?? "(removido)"} · {ROTULO_METRICA_META[meta.metrica]}
                </span>
                <span>
                  {formatarData(meta.periodoInicio)} – {formatarData(meta.periodoFim)}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${percentualBarra >= 100 ? "bg-green-500" : "bg-dourado"}`}
                  style={{ width: `${percentualBarra}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-zinc-900">
                  {formatarValor(unidade, progresso.realizado)} de {formatarValor(unidade, meta.valorAlvo)} (
                  {progresso.percentual.toFixed(0)}%)
                </span>
                {encerrada ? (
                  <Selo tom={progresso.percentual >= 100 ? "positivo" : "negativo"}>
                    {progresso.percentual >= 100 ? "Meta batida" : "Período encerrado"}
                  </Selo>
                ) : (
                  <span className="text-zinc-600">
                    Faltam {formatarValor(unidade, progresso.faltante)} · {progresso.diasRestantes}{" "}
                    {progresso.diasRestantes === 1 ? "dia restante" : "dias restantes"}
                  </span>
                )}
              </div>

              {!encerrada && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>Média diária: {formatarValor(unidade, progresso.mediaDiariaRealizada)}</span>
                  {progresso.necessarioPorDiaRestante !== null && (
                    <span>Necessário/dia: {formatarValor(unidade, progresso.necessarioPorDiaRestante)}</span>
                  )}
                  <span>Projeção final: {formatarValor(unidade, progresso.projecaoFinal)}</span>
                </div>
              )}
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}
