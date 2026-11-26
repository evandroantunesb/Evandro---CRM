import { Cartao } from "@/components/ui";
import type { FioBEmitido } from "@/lib/propostas/proposta-simples";
import { NOTA_FIO_B_PREMISSA, PARAGRAFOS_FIO_B, rotuloAnoFioB, rotuloPercentualFioB, TITULO_FIO_B } from "@/lib/propostas/textos-economia";

/**
 * "Como funciona a conta com energia solar" na página on-line da proposta (esquema 9; texto aprovado pelo Evandro em
 * 26/11/2026, opção A), a partir só dos dados congelados na emissão: o ano da emissão em destaque e o ano da premissa
 * (2029+) em tom mais claro.
 */
export function FioBDaProposta({ fioB }: { fioB: FioBEmitido }) {
  return (
    <Cartao titulo={TITULO_FIO_B}>
      <div data-testid="fio-b-proposta" className="flex flex-col gap-2 text-sm text-zinc-800">
        {PARAGRAFOS_FIO_B.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        <ol aria-label="Parte do Fio B paga por ano" className="mt-2 grid grid-cols-7 gap-1.5">
          {fioB.anos.map((a) => {
            const hoje = a.ano === fioB.anoEmissao;
            return (
              <li key={a.ano} className={`text-center text-[11px] tabular-nums ${hoje ? "font-semibold text-carvao" : "text-zinc-500"}`}>
                <div aria-hidden className="mb-1 flex h-12 items-end overflow-hidden rounded bg-zinc-100">
                  <span className={`block w-full bg-dourado ${a.premissa ? "opacity-45" : ""}`} style={{ height: `${a.percentual * 100}%` }} />
                </div>
                {rotuloAnoFioB(a)}
                <br />
                {rotuloPercentualFioB(a)}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-zinc-500">{NOTA_FIO_B_PREMISSA}</p>
      </div>
    </Cartao>
  );
}
