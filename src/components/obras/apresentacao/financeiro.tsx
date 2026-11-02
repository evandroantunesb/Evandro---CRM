import { formatarMoeda } from "@/lib/formatacao";
import type { CustosObraVM, ResultadoObraVM } from "@/lib/obras/custos";

const umaCasa = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const inteiro = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
const reais = (v: number) => `R$ ${inteiro(Math.abs(v))}`;
const desvio = (pct: number) => (pct > 0 ? `+${umaCasa(pct)}%` : pct < 0 ? `−${umaCasa(-pct)}%` : "0,0%");

/**
 * "Custos: planejado × realizado" do desenho aprovado: o planejado ocupa 85% da trilha (com a marca no fim) e o
 * realizado é proporcional a ele; acima do planejado, em vermelho. Categoria ainda em andamento não mostra desvio.
 */
export function CustosObra({ custos }: { custos: CustosObraVM }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-texto-2">
        <span>
          <i aria-hidden className="mr-1.5 inline-block h-1.5 w-3.5 rounded-full bg-[#d9d5cb] align-[1px]" />
          Planejado
        </span>
        <span>
          <i aria-hidden className="mr-1.5 inline-block h-1.5 w-3.5 rounded-full bg-dourado align-[1px]" />
          Realizado
        </span>
        <span>
          <i aria-hidden className="mr-1.5 inline-block h-1.5 w-3.5 rounded-full bg-erro align-[1px]" />
          Acima do planejado
        </span>
      </div>
      <ul className="flex flex-col">
        {custos.categorias.map((c, k) => (
          <li key={c.categoria} className="py-1">
            <div className="flex flex-wrap justify-between gap-x-2 text-xs tabular-nums">
              <span>
                <strong className="font-semibold text-texto">{c.nome}</strong>
                {!c.encerrada && <span className="ml-1 text-texto-2">em andamento</span>}
              </span>
              <span className="text-texto-2">
                Planejado {formatarMoeda(c.planejado)} · Realizado{" "}
                <strong className={`font-semibold ${c.acima ? "text-erro" : "text-texto"}`}>{formatarMoeda(c.realizado)}</strong>
                {c.desvioPct != null && <span className={`ml-1 ${c.desvioPct > 0 ? "text-erro" : "text-energia"}`}>{desvio(c.desvioPct)}</span>}
              </span>
            </div>
            <div className="relative mt-[3px] h-2.5 rounded-full bg-superficie-2" aria-hidden>
              <span className="absolute inset-y-0 left-0 w-[85%] rounded-full bg-[#d9d5cb]" />
              <span
                className={`absolute inset-y-0.5 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${c.acima ? "bg-erro" : "bg-dourado"}`}
                style={{ width: `${c.largura}%`, transitionDelay: `${k * 70}ms` }}
              />
              <span className="absolute -inset-y-[3px] left-[85%] w-0.5 rounded-sm bg-texto" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 border-t border-linha pt-1.5 text-xs tabular-nums">
        <strong className="font-semibold text-texto">Total</strong>
        <span className="text-texto-2">
          Planejado {formatarMoeda(custos.planejado)} · Realizado {formatarMoeda(custos.realizado)}
          {custos.realizadoPct != null && ` (${inteiro(custos.realizadoPct)}%)`}
        </span>
      </div>
    </div>
  );
}

/** "Lucro líquido previsto" do desenho: valor, % da venda, diferença para o planejado e a conta. */
export function LucroPrevisto({ resultado }: { resultado: ResultadoObraVM }) {
  const { lucro, lucroPct, diferenca, venda, custoProjetado, deducoes } = resultado;
  return (
    <section aria-label="Lucro previsto da obra" className="rounded-2xl border border-dourado/55 bg-dourado/12 px-4 py-3">
      <span className="block text-[11px] font-semibold tracking-[0.1em] text-dourado-texto uppercase">Lucro líquido previsto</span>
      <b className={`mt-1.5 block font-titulo text-[32px] leading-none font-light tracking-[-0.03em] tabular-nums ${lucro < 0 ? "text-erro" : "text-texto"}`}>
        {lucro < 0 ? `−${reais(lucro)}` : reais(lucro)}
      </b>
      <p className="mt-1 text-xs text-texto-2">
        {lucroPct == null ? "—" : `${umaCasa(lucroPct)}% da venda`} ·{" "}
        <strong className={`font-semibold ${diferenca < 0 ? "text-erro" : "text-energia"}`}>
          {diferenca < 0 ? "▼" : "▲"} {reais(diferenca)} vs. planejado
        </strong>
      </p>
      <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-2.5 gap-y-0.5 border-t border-linha pt-1.5 text-[11.5px] text-texto-2">
        <dt>Venda</dt>
        <dd className="text-right text-texto tabular-nums">{reais(venda)}</dd>
        <dt>Custo projetado da obra</dt>
        <dd className="text-right text-texto tabular-nums">− {reais(custoProjetado)}</dd>
        <dt>Impostos e comissões</dt>
        <dd className="text-right text-texto tabular-nums">− {reais(deducoes)}</dd>
      </dl>
    </section>
  );
}
