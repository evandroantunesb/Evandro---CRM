import { moedaCompacta } from "@/components/obras/completa";
import { CATEGORIAS, FAIXA_CATEGORIA, ROTULO_CATEGORIA, nomeDoMes, type MesForecast } from "@/lib/forecast";
import { COR, MarcaCategoria } from "./comum";

const inteiro = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);

/** Números do mês escolhido: as três categorias (valor cheio), o ponderado e a meta. */
export function NumerosForecast({ mes }: { mes: MesForecast }) {
  const pctMeta = mes.meta > 0 ? (mes.ponderado / mes.meta) * 100 : null;
  const falta = mes.meta - mes.ponderado;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-linha bg-linha sm:grid-cols-3 xl:grid-cols-5">
      {CATEGORIAS.map((c) => (
        <div key={c} className="flex min-w-0 flex-col gap-1 bg-superficie px-4 py-3">
          <dt className="flex items-center gap-1.5 text-xs text-texto-2">
            <MarcaCategoria categoria={c} />
            {ROTULO_CATEGORIA[c]}
          </dt>
          <dd className="font-titulo text-2xl font-light tracking-tight text-texto tabular-nums">{moedaCompacta(mes.categorias[c].valor)}</dd>
          <p className="text-[11px] text-texto-2">
            {mes.categorias[c].quantidade} {mes.categorias[c].quantidade === 1 ? "negócio" : "negócios"} · {FAIXA_CATEGORIA[c]}
          </p>
        </div>
      ))}
      <div className="flex min-w-0 flex-col gap-1 bg-superficie px-4 py-3">
        <dt className="text-xs text-texto-2">Previsto ponderado</dt>
        <dd className="font-titulo text-2xl font-light tracking-tight text-texto tabular-nums">{moedaCompacta(mes.ponderado)}</dd>
        <p className="text-[11px] text-texto-2">valor × chance de cada negócio</p>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 bg-dourado/10 px-4 py-3 sm:col-span-1">
        <dt className="text-xs text-texto-2">Meta de {nomeDoMes(mes.mes).toLowerCase()}</dt>
        <dd className="font-titulo text-2xl font-light tracking-tight text-texto tabular-nums">{mes.meta > 0 ? moedaCompacta(mes.meta) : "—"}</dd>
        {pctMeta != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-linha" role="img" aria-label={`${inteiro(pctMeta)}% da meta no ponderado`}>
            <span className="block h-full rounded-full bg-dourado" style={{ width: `${Math.min(100, pctMeta)}%` }} />
          </div>
        )}
        <p className="text-[11px] text-texto-2">
          {mes.meta <= 0 ? "sem meta de receita no mês" : falta > 0 ? `faltam ${moedaCompacta(falta)} no ponderado` : `${moedaCompacta(-falta)} acima da meta`}
        </p>
      </div>
    </dl>
  );
}

/** Gráfico principal (cartão escuro): valor cheio por mês, empilhado por categoria, com a meta de cada mês. */
export function PrevistoPorMes({ meses }: { meses: MesForecast[] }) {
  const ALTURA = 200;
  const escala = Math.max(1, ...meses.map((m) => Math.max(m.total, m.meta)));
  const descricao = meses
    .map((m) => `${nomeDoMes(m.mes)} ${moedaCompacta(m.total)}${m.meta > 0 ? `, meta ${moedaCompacta(m.meta)}` : ""}`)
    .join("; ");
  return (
    <section className="min-w-0 rounded-2xl bg-carvao p-5 text-offwhite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-offwhite/60 uppercase">Próximos 3 meses</p>
          <h2 className="font-titulo text-lg font-semibold">Previsto por mês</h2>
        </div>
        <div className="flex flex-wrap gap-3.5 text-offwhite">
          {CATEGORIAS.map((c) => (
            <MarcaCategoria key={c} categoria={c}>
              {ROTULO_CATEGORIA[c]}
            </MarcaCategoria>
          ))}
        </div>
      </div>
      <div role="img" aria-label={`Previsto bruto por mês: ${descricao}.`} className="mt-6 grid grid-cols-3 items-end gap-7 border-b border-offwhite/20 px-2">
        {meses.map((m) => (
          <div key={m.mes} className="relative flex flex-col items-center justify-end gap-2" style={{ height: ALTURA + 28 }}>
            <span className="font-titulo text-[15px] font-semibold tabular-nums">{moedaCompacta(m.total)}</span>
            <div className="flex w-full max-w-[120px] flex-col-reverse overflow-hidden rounded-t-[10px]">
              {CATEGORIAS.map((c) => (
                <span
                  key={c}
                  className={`block w-full origin-bottom animate-crescer motion-reduce:animate-none ${COR[c]}`}
                  style={{ height: (m.categorias[c].valor / escala) * ALTURA }}
                />
              ))}
            </div>
            {m.meta > 0 && (
              <span aria-hidden className="absolute inset-x-0 border-t-2 border-dashed border-offwhite/80" style={{ bottom: (m.meta / escala) * ALTURA }}>
                <span className="absolute -top-5 right-0 bg-carvao px-1 text-[10px] font-semibold whitespace-nowrap sm:text-[11px]">Meta {moedaCompacta(m.meta)}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-7 text-center text-xs text-offwhite/60">
        {meses.map((m) => (
          <span key={m.mes}>{nomeDoMes(m.mes)}</span>
        ))}
      </div>
      <p className="mt-3 text-xs text-offwhite/70">
        Barras somam o valor cheio dos negócios; o &quot;previsto ponderado&quot; lá em cima desconta pela chance de cada um.
      </p>
    </section>
  );
}

export function PorVendedor({ mes, linhas }: { mes: string; linhas: { nome: string; ponderado: number; meta: number }[] }) {
  const escala = Math.max(1, ...linhas.map((l) => Math.max(l.ponderado, l.meta)));
  return (
    <section className="min-w-0 rounded-2xl border border-linha bg-superficie p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-texto-2 uppercase">{nomeDoMes(mes)}</p>
          <h2 className="font-titulo text-lg font-semibold">Por vendedor</h2>
        </div>
        <span className="text-xs text-texto-2">ponderado × meta</span>
      </div>
      {linhas.length === 0 ? (
        <p className="mt-3 text-sm text-texto-2">Nenhum negócio no forecast deste mês.</p>
      ) : (
        <ul className="mt-3">
          {linhas.map((l) => {
            const pct = l.meta > 0 ? Math.round((l.ponderado / l.meta) * 100) : null;
            return (
              <li key={l.nome} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-linha py-2.5 text-[13px] first:border-t-0 first:pt-0">
                <span className="truncate font-medium">{l.nome}</span>
                <div
                  className="relative h-2.5 rounded-full bg-linha/60"
                  role="img"
                  aria-label={`${moedaCompacta(l.ponderado)} ponderado${l.meta > 0 ? `, meta ${moedaCompacta(l.meta)}` : ", sem meta"}`}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full bg-dourado" style={{ width: `${(l.ponderado / escala) * 100}%` }} />
                  {l.meta > 0 && <i className="absolute -top-1 -bottom-1 w-0.5 bg-texto" style={{ left: `${(l.meta / escala) * 100}%` }} />}
                </div>
                <span className="text-right tabular-nums">
                  {moedaCompacta(l.ponderado)} {pct != null && <span className="font-semibold text-dourado-texto">{pct}%</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2.5 text-xs text-texto-2">O traço escuro é a meta de cada um.</p>
    </section>
  );
}

