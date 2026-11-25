import { formatarMoeda } from "@/lib/formatacao";
import type { AnoProjecao, MotivoSemPayback } from "@/lib/projecao-financeira";
import { PREMISSAS_PROJECAO } from "@/lib/projecao-financeira";
import { anoDoPayback, barrasDoSaldo, ROTULO_SEM_PAYBACK, TEXTO_SEM_PAYBACK, textoPaybackAnosMeses } from "@/lib/projecao-exibicao";

/** Resultado do método v2 gravado: o que a ficha mostra (prévia aprovada em 25/11/2026). */
export type ResultadoV2Salvo = {
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  paybackMeses: number | null;
  paybackMotivo: MotivoSemPayback | null;
  economiaPrimeiroAno: number;
  economia25Anos: number;
  saldo25Anos: number | null;
  investimento: number;
  autoconsumoFracao: number;
  icms: number;
  pisCofins: number;
  /** Premissas gravadas com a projeção (reajuste, perdas, ano da troca). */
  premissas: Record<string, number>;
  anos: AnoProjecao[];
};

const moedaInteira = (v: number) => formatarMoeda(Math.round(v)).replace(/,00$/, "");
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Os quatro números do 1º mês, com o payback. */
export function NumerosDoKit({
  contaSemSolar,
  contaComSolar,
  economiaMensal,
  payback,
  paybackRodape,
}: {
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  payback: string;
  paybackRodape: string | null;
}) {
  const item = (rotulo: string, valor: string, rodape: string | null, extra = "", testid?: string) => (
    <div className="flex flex-col gap-1 bg-superficie px-4 py-3">
      <dt className="text-xs text-texto-2">{rotulo}</dt>
      <dd data-testid={testid} className={`font-titulo text-xl tabular-nums ${extra}`}>
        {valor}
      </dd>
      {rodape && <p className="text-xs text-texto-2">{rodape}</p>}
    </div>
  );
  return (
    <dl data-testid="numeros-kit" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-linha ring-1 ring-linha md:grid-cols-4">
      {item("Conta hoje", `${formatarMoeda(contaSemSolar)}`, "por mês, com tributos")}
      {item("Conta com o sistema", `${formatarMoeda(contaComSolar)}`, "taxa mínima + Fio B")}
      {item(
        "Economia",
        economiaMensal > 0 ? formatarMoeda(economiaMensal) : "sem economia",
        "por mês, no 1º mês",
        economiaMensal > 0 ? "text-green-700" : "",
        "economia-salva",
      )}
      {item("Payback", payback, paybackRodape, "", "payback-salvo")}
    </dl>
  );
}

/** Gráfico do saldo acumulado em 25 anos (barras: cinza = pagando o sistema, dourado = já se pagou). */
function GraficoSaldo({ anos, paybackMeses }: { anos: AnoProjecao[]; paybackMeses: number | null }) {
  const geometria = barrasDoSaldo(anos);
  if (!geometria) return null;
  const anoPb = anoDoPayback(paybackMeses);
  const troca = anos.find((a) => a.trocaInversor > 0);
  const n = anos.length;
  const marca = (ano: number) => {
    const esquerda = ((ano - 1) / n) * 100;
    // Perto do fim, o texto cresce para a esquerda para não sair do quadro.
    return ano > n * 0.7 ? { right: `${100 - esquerda - 100 / n}%` } : { left: `${esquerda}%` };
  };
  return (
    <div className="mt-6">
      <div
        role="img"
        aria-label={`Saldo acumulado ano a ano, de ${moedaInteira(anos[0]!.saldoAcumulado!)} no 1º ano a ${moedaInteira(anos[n - 1]!.saldoAcumulado!)} no ano ${n}.`}
        className="relative grid h-52 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        <div className="absolute inset-x-0 border-t border-offwhite/35" style={{ top: `${geometria.zeroPct}%` }} />
        {geometria.barras.map((b) => (
          <div key={b.ano} className="relative">
            <div
              className={`absolute inset-x-0 rounded-[3px] ${b.positivo ? "bg-dourado" : "bg-offwhite/45"}`}
              style={{ top: `${b.topoPct}%`, height: `${b.alturaPct}%` }}
            />
          </div>
        ))}
        {troca && (
          <span className="absolute top-1 rounded bg-carvao/85 px-1 text-[11px] leading-tight whitespace-nowrap text-offwhite/80" style={marca(troca.ano)}>
            troca do inversor (ano {troca.ano})
          </span>
        )}
        {anoPb != null && (
          <span
            className="absolute rounded bg-carvao/85 px-1 text-[11px] leading-tight whitespace-nowrap text-offwhite"
            style={{ ...marca(anoPb), top: `${Math.max(geometria.zeroPct - 14, 8)}%` }}
          >
            ↓ se paga no ano {anoPb}
          </span>
        )}
      </div>
      <div
        aria-hidden
        className="mt-1.5 grid gap-[3px] text-center text-[11px] text-offwhite/55"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {anos.map((a) => (
          <span key={a.ano}>{a.ano === 1 || a.ano % 5 === 0 ? a.ano : ""}</span>
        ))}
      </div>
    </div>
  );
}

/** Resultado do método v2 na ficha: números, projeção de 25 anos, premissas e a tabela ano a ano. */
export function ResultadoKitV2({ r }: { r: ResultadoV2Salvo }) {
  const textoPb = textoPaybackAnosMeses(r.paybackMeses);
  const payback = textoPb ?? (r.paybackMotivo ? ROTULO_SEM_PAYBACK[r.paybackMotivo] : "indisponível");
  const paybackRodape = textoPb ? `${r.paybackMeses} meses` : null;
  const troca = r.anos.find((a) => a.trocaInversor > 0);
  const anoTroca = r.premissas.anoTrocaInversor ?? PREMISSAS_PROJECAO.anoTrocaInversor;
  const reajuste = r.premissas.reajusteAnual ?? PREMISSAS_PROJECAO.reajusteAnual;
  const perda1 = r.premissas.perdaPrimeiroAno ?? PREMISSAS_PROJECAO.perdaPrimeiroAno;
  const perdaAno = r.premissas.perdaAnual ?? PREMISSAS_PROJECAO.perdaAnual;
  const horizonte = r.anos.length;
  const rodape = (rotulo: string, valor: string) => (
    <div className="bg-carvao px-3.5 py-3">
      <dt className="text-xs text-offwhite/65">{rotulo}</dt>
      <dd className="mt-1 font-titulo text-lg whitespace-nowrap tabular-nums">{valor}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <NumerosDoKit
        contaSemSolar={r.contaSemSolar}
        contaComSolar={r.contaComSolar}
        economiaMensal={r.economiaMensal}
        payback={payback}
        paybackRodape={paybackRodape}
      />
      {!textoPb && r.paybackMotivo && (
        <p data-testid="payback-motivo" role="status" className="-mt-2 text-xs text-texto-2">
          {TEXTO_SEM_PAYBACK[r.paybackMotivo]}
        </p>
      )}

      <section data-testid="projecao-25-anos" className="rounded-2xl bg-carvao p-5 text-offwhite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-offwhite/65 uppercase">Projeção de {horizonte} anos</p>
            <h3 className="mt-1 font-titulo text-lg font-semibold">
              {r.saldo25Anos != null ? `Saldo do cliente em ${horizonte} anos: ${moedaInteira(r.saldo25Anos)}` : `Economia em ${horizonte} anos: ${moedaInteira(r.economia25Anos)}`}
            </h3>
            <p className="mt-1 text-sm text-offwhite/70">
              {r.saldo25Anos != null
                ? "Economia acumulada menos o investimento e a troca do inversor."
                : "Sem o saldo: falta o que está indicado acima para descontar o investimento e a troca do inversor."}
            </p>
          </div>
          {r.saldo25Anos != null && (
            <div className="flex gap-3 text-xs text-offwhite/75">
              <span className="flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-offwhite/45" />
                pagando o sistema
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-dourado" />
                já se pagou
              </span>
            </div>
          )}
        </div>
        <GraficoSaldo anos={r.anos} paybackMeses={r.paybackMeses} />
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-offwhite/12 md:grid-cols-4">
          {rodape("Economia no 1º ano", moedaInteira(r.economiaPrimeiroAno))}
          {rodape(`Economia em ${horizonte} anos`, moedaInteira(r.economia25Anos))}
          {rodape("Investimento", r.investimento > 0 ? formatarMoeda(r.investimento) : "sem valor")}
          {rodape("Troca do inversor", troca ? `${moedaInteira(troca.trocaInversor)} no ano ${troca.ano}` : "sem preço")}
        </dl>
      </section>

      <p data-testid="premissas-projecao" className="rounded-xl bg-fundo px-3.5 py-3 text-xs leading-relaxed text-zinc-700">
        <b>Premissas:</b> autoconsumo de {pct(r.autoconsumoFracao)} (do negócio), ICMS {pct(r.icms)} e PIS/Cofins {pct(r.pisCofins)} (da
        empresa), reajuste da tarifa de {pct(reajuste)} ao ano, perda dos módulos de {pct(perda1)} no 1º ano e {pct(perdaAno)} ao
        ano depois, Fio B de 60% (2026) a 100% (a partir de 2029), troca do inversor no ano {anoTroca} pelo preço de hoje na tabela.
        Bandeiras tarifárias e iluminação pública ficam fora.
      </p>

      <details data-testid="projecao-ano-a-ano" className="text-sm">
        <summary className="cursor-pointer font-semibold text-dourado-texto">Ver a projeção ano a ano</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-linha text-texto-2">
                <th className="px-2 py-1.5 text-left font-semibold">Ano</th>
                <th className="px-2 py-1.5 text-right font-semibold">Geração (kWh)</th>
                <th className="px-2 py-1.5 text-right font-semibold">Economia</th>
                <th className="px-2 py-1.5 text-right font-semibold">Troca do inversor</th>
                <th className="px-2 py-1.5 text-right font-semibold">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {r.anos.map((a) => (
                <tr key={a.ano} className="border-b border-zinc-100">
                  <td className="px-2 py-1.5 text-left">{a.ano}</td>
                  <td className="px-2 py-1.5 text-right">{Math.round(a.geracaoKwh).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-1.5 text-right">{moedaInteira(a.economia)}</td>
                  <td className="px-2 py-1.5 text-right">{a.trocaInversor > 0 ? moedaInteira(a.trocaInversor) : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{a.saldoAcumulado != null ? moedaInteira(a.saldoAcumulado) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
