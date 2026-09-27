import { Cartao } from "@/components/ui";
import type { FaixaComissao } from "@/lib/comissoes";
import { formatarMoeda } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_TIPO_CALCULO_COMISSAO, type TipoCalculoComissao } from "@/lib/tipos";

function formatarReferencia(referencia: string) {
  return new Date(`${referencia}T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatarFaixa(tipoCalculo: TipoCalculoComissao, faixa: FaixaComissao) {
  const de = formatarMoeda(faixa.resultado_minimo);
  const ate = faixa.resultado_maximo === null ? "sem teto" : formatarMoeda(faixa.resultado_maximo);
  const valor = tipoCalculo === "percentual" ? `${faixa.valor}%` : `${faixa.valor}x`;
  return `${de} até ${ate}: ${valor}`;
}

export default async function MinhasComissoes() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const [{ data: plano }, { data: historico }] = await Promise.all([
    supabase
      .from("planos_comissao")
      .select("salario_base, meta_ote, tipo_calculo, faixas")
      .eq("empresa_id", atual.empresaId)
      .eq("membro_id", atual.membroId)
      .eq("ativo", true)
      .maybeSingle(),
    supabase
      .from("comissoes_calculadas")
      .select("id, referencia, resultado_apurado, salario_base, valor_comissao, valor_total")
      .eq("empresa_id", atual.empresaId)
      .eq("membro_id", atual.membroId)
      .order("referencia", { ascending: false })
      .limit(24),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Comissões</h1>

      {!plano ? (
        <Cartao>
          <p className="text-sm text-zinc-600">Você ainda não tem um plano de comissão configurado.</p>
        </Cartao>
      ) : (
        <Cartao titulo="Seu plano">
          <div className="flex flex-col gap-2 text-sm">
            {plano.salario_base !== null && (
              <p>
                Salário-base: <span className="font-medium text-zinc-900">{formatarMoeda(plano.salario_base)}</span>
              </p>
            )}
            {plano.meta_ote !== null && (
              <p>
                Meta (OTE): <span className="font-medium text-zinc-900">{formatarMoeda(plano.meta_ote)}</span>
              </p>
            )}
            <div>
              <p className="text-zinc-600">Faixas de resultado ({ROTULO_TIPO_CALCULO_COMISSAO[plano.tipo_calculo as TipoCalculoComissao].toLowerCase()}):</p>
              <ul className="mt-1 list-inside list-disc text-zinc-900">
                {(plano.faixas as unknown as FaixaComissao[]).map((f, i) => (
                  <li key={i}>{formatarFaixa(plano.tipo_calculo as TipoCalculoComissao, f)}</li>
                ))}
              </ul>
            </div>
          </div>
        </Cartao>
      )}

      <Cartao titulo="Histórico de cálculo">
        {!historico?.length && <p className="text-sm text-zinc-600">Nenhum cálculo feito ainda.</p>}
        <ul className="flex flex-col">
          {(historico ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2 text-sm first:border-t-0">
              <span className="text-zinc-900">{formatarReferencia(h.referencia)}</span>
              <span className="text-zinc-600">
                Resultado {formatarMoeda(h.resultado_apurado)} · Comissão {formatarMoeda(h.valor_comissao)} · Total{" "}
                <span className="font-medium text-zinc-900">{formatarMoeda(h.valor_total)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
