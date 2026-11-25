import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { paybackDepoisDoHorizonte, saldoNoHorizonte, textoPremissasEconomia, type EconomiaEmitida } from "@/lib/propostas/economia-emissao";
import { barrasDoSaldo, textoPaybackAnosMeses } from "@/lib/projecao-exibicao";

const reais = (v: number) => formatarMoeda(Math.round(v)).replace(/,00$/, "");

/**
 * "Sua economia" na página on-line da proposta (esquema 7), a partir só dos dados congelados na emissão. Cada parte
 * aparece com o bloco ativo no modelo; sem payback, o retorno e o gráfico somem.
 */
export function EconomiaDaProposta({ economia }: { economia: EconomiaEmitida }) {
  const { blocos, horizonteAnos: N } = economia;
  const payback = textoPaybackAnosMeses(economia.paybackMeses);
  const saldo = saldoNoHorizonte(economia);
  const geometria = blocos.retorno && payback && saldo != null ? barrasDoSaldo(economia.anos) : null;
  const depois = paybackDepoisDoHorizonte(economia);
  const item = (rotulo: string, valor: string, sub: string, testid?: string) => (
    <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd data-testid={testid} className="font-titulo text-lg font-semibold text-carvao tabular-nums">
        {valor}
      </dd>
      <p className="text-xs text-zinc-500">{sub}</p>
    </div>
  );

  return (
    <Cartao titulo="Sua economia">
      <div data-testid="economia-proposta" className="flex flex-col gap-4">
        {blocos.conta && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <p className="text-xs text-zinc-500">Conta hoje</p>
              <p className="font-titulo text-lg font-semibold tabular-nums">{reais(economia.contaSemSolar)}/mês</p>
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <p className="text-xs text-zinc-500">Conta com solar</p>
              <p className="font-titulo text-lg font-semibold tabular-nums">{reais(economia.contaComSolar)}/mês</p>
            </div>
          </div>
        )}
        {(blocos.resumo || !blocos.conta) && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {item("Economia por mês", reais(economia.economiaMensal), "no primeiro mês", "economia-mes")}
            {item("Economia no 1º ano", reais(economia.economiaPrimeiroAno), "já com o reajuste")}
            {payback && item("Retorno", payback, "o sistema se paga", "economia-retorno")}
            {item(`Em ${N} anos`, reais(economia.economiaNoHorizonte), "de economia acumulada", "economia-horizonte")}
          </dl>
        )}
        {geometria && (
          <div className="rounded-xl bg-carvao p-4 text-offwhite">
            <p className="text-sm font-semibold">Retorno do investimento em {N} anos</p>
            <div
              role="img"
              aria-label={`Saldo acumulado em ${N} anos: de ${reais(economia.anos[0]!.saldoAcumulado!)} no 1º ano a ${reais(saldo!)} no ano ${N}.`}
              className="relative mt-4 grid h-40 gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}
            >
              <div className="absolute inset-x-0 border-t border-offwhite/35" style={{ top: `${geometria.zeroPct}%` }} />
              {geometria.barras.map((b) => (
                <div key={b.ano} className="relative">
                  <div className={`absolute inset-x-0 rounded-[3px] ${b.positivo ? "bg-dourado" : "bg-offwhite/45"}`} style={{ top: `${b.topoPct}%`, height: `${b.alturaPct}%` }} />
                </div>
              ))}
            </div>
            <div aria-hidden className="mt-1 grid gap-[3px] text-center text-[11px] text-offwhite/55" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
              {economia.anos.map((a) => (
                <span key={a.ano}>{a.ano === 1 || a.ano % (N <= 10 ? 1 : 5) === 0 ? a.ano : ""}</span>
              ))}
            </div>
            <p data-testid="economia-payback-texto" className="mt-3 text-sm">
              {depois ? `O sistema se paga em ${payback}, depois do período mostrado. A partir daí, a economia fica com você.` : `O sistema se paga em ${payback}.`}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-offwhite/65">Investimento</dt>
                <dd className="font-titulo text-base">{reais(economia.investimento)}</dd>
              </div>
              <div>
                <dt className="text-offwhite/65">Economia em {N} anos</dt>
                <dd className="font-titulo text-base">{reais(economia.economiaNoHorizonte)}</dd>
              </div>
              <div>
                <dt className="text-offwhite/65">Saldo em {N} anos</dt>
                <dd className="font-titulo text-base">{reais(saldo!)}</dd>
              </div>
            </dl>
          </div>
        )}
        <p className="text-xs text-zinc-500">{textoPremissasEconomia(economia)}</p>
      </div>
    </Cartao>
  );
}
