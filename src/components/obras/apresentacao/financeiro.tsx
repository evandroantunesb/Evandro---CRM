import { formatarMoeda } from "@/lib/crm";
import { desvioCusto, resultadoFinanceiro, totaisCustos } from "@/lib/obras/apresentacao/calculos";
import { ROTULO_CATEGORIA_CUSTO, type CustoCategoria, type EntradaFinanceiro } from "@/lib/obras/apresentacao/tipos";

const numero1 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
const pct = (v: number | null) => (v == null ? "—" : `${numero1(v)}%`);
const comSinal = (v: number) => (v > 0 ? `+${formatarMoeda(v)}` : v < 0 ? `−${formatarMoeda(-v)}` : formatarMoeda(0));

/**
 * Custos por categoria: orçado × realizado e desvio. Estouro (realizado acima do orçado) em âmbar
 * discreto; vermelho fica reservado para perda/erro. Tabela no desktop, lista no celular.
 */
export function CustosPorCategoria({ custos }: { custos: CustoCategoria[] }) {
  const linhas = custos.map(desvioCusto);
  const total = totaisCustos(custos);
  const totalDesvio = desvioCusto({ categoria: "material_ca", ...total });
  const maior = Math.max(...custos.flatMap((c) => [c.orcado, c.realizado]), 1);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {linhas.map((l) => {
          const estouro = l.desvio > 0;
          return (
            <li key={l.categoria} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium text-zinc-900">{ROTULO_CATEGORIA_CUSTO[l.categoria]}</span>
                <span className={`tabular-nums ${estouro ? "font-medium text-amber-700" : "text-zinc-500"}`}>
                  {comSinal(l.desvio)} ({l.desvioPct == null ? "—" : `${l.desvioPct > 0 ? "+" : ""}${pct(l.desvioPct)}`})
                </span>
              </div>
              {/* Orçado (cinza) e realizado (carvão/âmbar) na mesma escala. */}
              <div className="flex flex-col gap-0.5" aria-hidden>
                <div className="h-1.5 rounded-full bg-zinc-200" style={{ width: `${(l.orcado / maior) * 100}%` }} />
                <div className={`h-1.5 rounded-full ${estouro ? "bg-amber-500" : "bg-carvao"}`} style={{ width: `${(l.realizado / maior) * 100}%` }} />
              </div>
              <p className="flex flex-wrap justify-between gap-x-3 text-xs text-zinc-500 tabular-nums">
                <span>Orçado {formatarMoeda(l.orcado)}</span>
                <span>Realizado {formatarMoeda(l.realizado)}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-between gap-x-3 border-t border-zinc-200 pt-2 text-sm tabular-nums">
        <span className="font-medium text-zinc-900">Total</span>
        <span className="text-zinc-600">
          {formatarMoeda(total.orcado)} orçado · {formatarMoeda(total.realizado)} realizado ·{" "}
          <span className={totalDesvio.desvio > 0 ? "font-medium text-amber-700" : ""}>{comSinal(totalDesvio.desvio)}</span>
        </span>
      </div>
      <p className="flex items-center gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded-full bg-zinc-200" /> Orçado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded-full bg-carvao" /> Realizado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded-full bg-amber-500" /> Acima do orçado
        </span>
      </p>
    </div>
  );
}

/**
 * Resultado financeiro. Separa o confirmado/realizado (gasto até hoje) do projetado (custo
 * FINAL estimado) e calcula a margem sempre sobre o projetado.
 */
export function ResultadoFinanceiro({ entrada, valorVendido }: { entrada: EntradaFinanceiro; valorVendido: number | null }) {
  const r = resultadoFinanceiro(entrada);
  const linha = (rotulo: string, valor: string, detalhe?: string, destaque?: boolean) => (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 py-2 ${destaque ? "" : "border-b border-zinc-100"}`}>
      <dt className="text-sm text-zinc-600">
        {rotulo}
        {detalhe && <span className="block text-[11px] text-zinc-400">{detalhe}</span>}
      </dt>
      <dd className={`tabular-nums ${destaque ? "text-2xl font-semibold text-zinc-900" : "text-sm font-medium text-zinc-900"}`}>{valor}</dd>
    </div>
  );
  return (
    <dl className="flex flex-col">
      {valorVendido != null && linha("Valor vendido (contrato)", formatarMoeda(valorVendido), "Registrado na venda")}
      {linha("Receita líquida estimada", formatarMoeda(r.receitaLiquida), "Após tributos e comissões")}
      {linha("Custo orçado", formatarMoeda(r.custoOrcado))}
      {linha("Custo realizado até hoje", formatarMoeda(r.custoRealizado), "Já gasto — não é o custo final")}
      {linha("Custo final projetado", formatarMoeda(r.custoFinalProjetado), `Realizado + ${formatarMoeda(r.aRealizar)} a realizar · ${comSinal(r.desvioProjetado)} vs. orçado`)}
      <div className="mt-2 rounded-lg bg-zinc-50 px-3">
        {linha("Margem líquida estimada", `${formatarMoeda(r.margemLiquida)} · ${pct(r.margemLiquidaPct)}`, undefined, true)}
        {r.variacaoMargemPp != null && (
          <p className={`pb-2 text-xs ${r.variacaoMargemPp < 0 ? "text-amber-700" : "text-zinc-500"}`}>
            {r.variacaoMargemPp > 0 ? "+" : r.variacaoMargemPp < 0 ? "−" : ""}
            {numero1(Math.abs(r.variacaoMargemPp))} p.p. em relação à margem planejada ({pct(r.margemPlanejadaPct)})
          </p>
        )}
      </div>
    </dl>
  );
}
