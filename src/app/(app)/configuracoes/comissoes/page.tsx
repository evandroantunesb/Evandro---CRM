import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { TipoCalculoComissao } from "@/lib/tipos";
import { CalcularComissaoForm, PlanoComissaoForm, type PlanoSalvo } from "./formularios";

function formatarReferencia(referencia: string) {
  return new Date(`${referencia}T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ConfigComissoes() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: planos }, { data: historico }, config] = await Promise.all([
    supabase
      .from("planos_comissao")
      .select("id, membro_id, salario_base, meta_ote, tipo_calculo, faixas")
      .eq("empresa_id", atual.empresaId)
      .eq("ativo", true),
    supabase
      .from("comissoes_calculadas")
      .select("id, membro_id, referencia, resultado_apurado, valor_comissao, valor_total")
      .eq("empresa_id", atual.empresaId)
      .order("referencia", { ascending: false })
      .limit(50),
    carregarConfiguracao(atual.empresaId),
  ]);

  const membros = config.membros.filter((m) => m.ativo);
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const planoPorMembro = new Map((planos ?? []).map((p) => [p.membro_id, p]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Comissões</h1>
      <p className="text-sm text-zinc-600">
        Cada colaborador tem um plano com salário-base opcional e faixas de resultado (receita de negócios ganhos no
        mês). É um conceito separado de pontos e de metas — não afeta o extrato nem o ranking da gamificação.
      </p>

      <Cartao titulo="Planos por colaborador">
        {membros.map((membro) => {
          const p = planoPorMembro.get(membro.id);
          const plano: PlanoSalvo = {
            planoId: p?.id ?? null,
            salarioBase: p?.salario_base ?? null,
            metaOte: p?.meta_ote ?? null,
            tipoCalculo: (p?.tipo_calculo as TipoCalculoComissao) ?? "percentual",
            faixas: (p?.faixas as PlanoSalvo["faixas"]) ?? [],
          };
          return <PlanoComissaoForm key={membro.id} membro={membro} plano={plano} />;
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
              <span className="text-zinc-900">
                {nomeMembro.get(h.membro_id) ?? "(removido)"} · {formatarReferencia(h.referencia)}
              </span>
              <span className="text-zinc-600">
                Resultado {formatarMoeda(h.resultado_apurado)} · Comissão {formatarMoeda(h.valor_comissao)} · Total{" "}
                <span className="font-medium text-zinc-900">{formatarMoeda(h.valor_total)}</span>
              </span>
            </div>
          ))}
        </div>
      </Cartao>
    </div>
  );
}
