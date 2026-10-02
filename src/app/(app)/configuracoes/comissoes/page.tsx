import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_STATUS_COMISSAO, type StatusComissao, type TipoCalculoComissao } from "@/lib/tipos";
import { CalcularComissaoForm, FecharComissaoForm, HistoricoVersoesPlano, PlanoComissaoForm, type VersaoPlano } from "./formularios";

function formatarReferencia(referencia: string) {
  return new Date(`${referencia}T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ConfigComissoes() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const mesAtual = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: planos }, { data: historico }, config] = await Promise.all([
    supabase
      .from("planos_comissao")
      .select("id, membro_id, vigencia_inicio, salario_base, meta_ote, tipo_calculo, faixas")
      .eq("empresa_id", atual.empresaId)
      .order("vigencia_inicio", { ascending: false }),
    supabase
      .from("comissoes_calculadas")
      .select("id, membro_id, referencia, resultado_apurado, valor_comissao, valor_total, status")
      .eq("empresa_id", atual.empresaId)
      .order("referencia", { ascending: false })
      .limit(50),
    carregarConfiguracao(atual.empresaId),
  ]);

  const membros = config.membros.filter((m) => m.ativo);
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));

  const versoesPorMembro = new Map<string, VersaoPlano[]>();
  for (const p of planos ?? []) {
    const versao: VersaoPlano = {
      id: p.id,
      vigenciaInicio: p.vigencia_inicio,
      salarioBase: p.salario_base,
      metaOte: p.meta_ote,
      tipoCalculo: p.tipo_calculo as TipoCalculoComissao,
      faixas: p.faixas as unknown as VersaoPlano["faixas"],
    };
    const lista = versoesPorMembro.get(p.membro_id) ?? [];
    lista.push(versao);
    versoesPorMembro.set(p.membro_id, lista);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Comissões</h1>
      <p className="text-sm text-zinc-600">
        Cada colaborador tem um plano com salário-base opcional e faixas de resultado (receita de negócios ganhos no
        mês). É um conceito separado de pontos e de metas — não afeta o extrato nem o ranking da gamificação. Alterar
        o plano cria uma nova versão com vigência a partir do mês escolhido; versões passadas são preservadas.
      </p>

      <Cartao titulo="Planos por colaborador">
        {membros.map((membro) => {
          const versoes = versoesPorMembro.get(membro.id) ?? [];
          const versaoAtual = versoes.find((v) => v.vigenciaInicio <= mesAtual) ?? null;
          return (
            <div key={membro.id}>
              <PlanoComissaoForm membro={membro} versaoAtual={versaoAtual} />
              <HistoricoVersoesPlano versoes={versoes} versaoVigenteId={versaoAtual?.id ?? null} mesAtual={mesAtual} />
            </div>
          );
        })}
      </Cartao>

      <Cartao titulo="Calcular comissão do mês">
        <CalcularComissaoForm membros={membros} />
      </Cartao>

      <Cartao titulo={`Histórico de cálculo (${historico?.length ?? 0})`}>
        {!historico?.length && <p className="text-sm text-zinc-600">Nenhum cálculo feito ainda.</p>}
        <div className="flex flex-col">
          {(historico ?? []).map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-100 py-2 text-sm first:border-t-0"
            >
              <span className="flex items-center gap-2 text-zinc-900">
                {nomeMembro.get(h.membro_id) ?? "(removido)"} · {formatarReferencia(h.referencia)}
                <Selo tom={h.status === "fechada" ? "neutro" : "atencao"}>{ROTULO_STATUS_COMISSAO[h.status as StatusComissao]}</Selo>
              </span>
              <span className="flex items-center gap-3 text-zinc-600">
                Resultado {formatarMoeda(h.resultado_apurado)} · Comissão {formatarMoeda(h.valor_comissao)} · Total{" "}
                <span className="font-medium text-zinc-900">{formatarMoeda(h.valor_total)}</span>
                {h.status === "aberta" && <FecharComissaoForm comissaoId={h.id} />}
              </span>
            </div>
          ))}
        </div>
      </Cartao>
    </div>
  );
}
