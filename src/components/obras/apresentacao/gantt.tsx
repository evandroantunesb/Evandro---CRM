import Link from "next/link";
import type { CronogramaVM, EtapaGanttVM, Faixa, Tom } from "@/lib/obras/cronograma";
import { ddmm } from "@/lib/obras/cronograma";

const TOM: Record<Tom, string> = { erro: "text-erro", atencao: "text-dourado-texto", ok: "text-energia", neutro: "text-texto-2" };
const NUM: Record<EtapaGanttVM["estado"], string> = {
  ok: "bg-energia/12 text-energia",
  and: "bg-dourado text-carvao",
  pend: "bg-superficie-2 text-texto-2",
};

/** Ao trocar de obra, as barras deslizam até o novo lugar, em cascata pela linha. */
const barra = (f: Faixa, linha: number) => ({ left: `${f[0]}%`, width: `${f[1]}%`, transitionDelay: `${linha * 70}ms` });
const TRANSICAO = "absolute transition-[left,width] duration-700 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none";

/**
 * Gantt do desenho aprovado "Obras — Apresentação": uma linha por etapa com o previsto (fino), o realizado (dourado)
 * e a previsão (tracejada), a linha de hoje, o losango da entrega contratada na última etapa e, à direita, o tempo na
 * etapa e o desvio. Atraso com justificativa (ou com o motivo calculado do atraso herdado) fica sublinhado e mostra o
 * texto ao passar o mouse ou focar; a justificativa pendente oferece "Cobrar justificativa" a quem pode cobrar
 * (`cobrarHref`, a ficha da obra).
 */
export function Gantt({ cronograma, cobrarHref = null }: { cronograma: CronogramaVM; cobrarHref?: string | null }) {
  const { meses, hoje, contratada, etapas } = cronograma;
  const separadores = meses.slice(0, -1).reduce<number[]>((acc, m) => [...acc, (acc.at(-1) ?? 0) + m.largura], []);
  return (
    <div role="region" aria-label="Etapas da obra (role na horizontal para ver todo o período)" tabIndex={0} data-sem-gesto className="max-w-full overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-dourado/40">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[240px_minmax(0,1fr)_150px] text-[11px] font-medium tracking-[0.08em] text-texto-2 uppercase">
          <div className="py-2">Etapa</div>
          <div className="flex py-2">
            {meses.map((m) => (
              <span key={m.rotulo + m.largura} className="truncate pl-1" style={{ width: `${m.largura}%` }}>
                {m.rotulo}
              </span>
            ))}
          </div>
          <div className="py-2 text-right">Tempo na etapa</div>
        </div>
        <ol>
          {etapas.map((e, i) => (
            <li key={e.chave} className="grid min-h-12 grid-cols-[240px_minmax(0,1fr)_150px]">
              <div className="flex items-center gap-2.5 border-b border-linha py-2 pr-3">
                <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors ${NUM[e.estado]}`}>
                  {e.estado === "ok" ? "✓" : e.num}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-texto">{e.nome}</p>
                  <p className="truncate text-[11.5px] text-texto-2">{e.sub}</p>
                </div>
              </div>
              <div className="relative border-b border-linha" aria-hidden>
                {separadores.map((s) => (
                  <span key={s} className="absolute inset-y-0 w-px bg-linha" style={{ left: `${s}%` }} />
                ))}
                <span className={`${TRANSICAO} top-[calc(50%-10px)] h-1.5 rounded-full bg-[#d9d5cb]`} style={barra(e.previsto, i)} />
                {e.real && <span className={`${TRANSICAO} top-[calc(50%-1px)] h-2.5 rounded-full bg-dourado`} style={barra(e.real, i)} />}
                {e.previsao && (
                  <span
                    className={`${TRANSICAO} top-[calc(50%-1px)] box-border h-2.5 rounded-full border-[1.5px] border-dashed border-acao-forte bg-dourado/25`}
                    style={barra(e.previsao, i)}
                  />
                )}
                {i === etapas.length - 1 && (
                  <span className={`${TRANSICAO} top-[calc(50%-5px)] -ml-[5px] size-[11px] rotate-45 rounded-[2px] bg-texto`} style={{ left: `${contratada.pos}%` }} />
                )}
                {hoje != null && <span className="absolute inset-y-0 z-[2] w-0.5 bg-texto" style={{ left: `${hoje}%` }} />}
              </div>
              <div className="flex flex-col items-end justify-center border-b border-linha py-2 text-right tabular-nums">
                <span className="text-[13.5px] font-semibold text-texto">{e.tempo}</span>
                {e.dica ? (
                  <span
                    tabIndex={0}
                    className={`group relative inline-flex cursor-help items-center gap-1 border-b border-dashed border-current text-[11.5px] font-semibold outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-dourado ${TOM[e.desvio.tom]}`}
                  >
                    {e.desvio.texto}
                    {e.dica.pendente && " · pendente"}
                    <span className="sr-only">
                      . {e.dica.titulo}: {e.dica.texto} {e.dica.rodape}
                    </span>
                    <span
                      role="tooltip"
                      className="absolute right-0 bottom-[calc(100%+8px)] z-20 hidden w-[300px] rounded-xl bg-carvao px-3.5 py-3 text-left font-normal text-offwhite shadow-[0_10px_28px_rgb(0_0_0/30%)] group-focus-within:block group-hover:block"
                    >
                      <b aria-hidden className="mb-1 block text-[11px] font-semibold tracking-[0.1em] text-dourado uppercase">
                        {e.dica.titulo}
                      </b>
                      <span aria-hidden className="block text-[12.5px] leading-[1.45]">
                        {e.dica.texto}
                      </span>
                      <small aria-hidden className="mt-1.5 block text-[11px] text-offwhite/60">
                        {e.dica.rodape}
                      </small>
                      {e.dica.pendente && cobrarHref && (
                        <Link
                          href={cobrarHref}
                          className="mt-2 inline-block rounded-md bg-dourado px-2.5 py-1 text-[11.5px] font-semibold text-carvao hover:bg-dourado/90"
                        >
                          Cobrar justificativa
                        </Link>
                      )}
                    </span>
                  </span>
                ) : (
                  <span className={`text-[11.5px] font-semibold ${TOM[e.desvio.tom]}`}>{e.desvio.texto}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const LEGENDA = "mr-1.5 inline-block h-[7px] w-5 rounded-full align-[1px]";

export function LegendaGantt({ hoje, entregaContratada }: { hoje: string; entregaContratada: string }) {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[11.5px] text-texto-2">
      <span>
        <i aria-hidden className={`${LEGENDA} bg-[#d9d5cb]`} />
        Previsto
      </span>
      <span>
        <i aria-hidden className={`${LEGENDA} bg-dourado`} />
        Realizado
      </span>
      <span>
        <i aria-hidden className={`${LEGENDA} box-border border-[1.5px] border-dashed border-acao-forte bg-dourado/25`} />
        Previsão
      </span>
      <span>
        <i aria-hidden className="mr-1.5 inline-block h-3 w-0.5 bg-texto align-[-2px]" />
        Hoje ({ddmm(hoje)})
      </span>
      <span>
        <i aria-hidden className="mr-1.5 inline-block size-[9px] rotate-45 rounded-[2px] bg-texto" />
        Entrega contratada ({ddmm(entregaContratada)})
      </span>
      <span className="sm:ml-auto">Passe o mouse num atraso sublinhado para ver a justificativa</span>
    </div>
  );
}
