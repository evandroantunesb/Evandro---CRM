import { descricaoGraficoMensal, escalaDoGrafico, legendaConsumo, MESES_ABREV, NOTA_GERACAO_MENSAL, type SerieMensal } from "@/lib/geracao-mensal";

/**
 * "Geração e consumo mês a mês" na página on-line da proposta (esquema 8; prévia aprovada pelo Evandro em 25/11/2026),
 * dentro do cartão "O sistema", só com os dados congelados na emissão.
 */
export function GeracaoMensalDaProposta({ mensal }: { mensal: SerieMensal }) {
  const { maximo } = escalaDoGrafico([...mensal.geracaoKwh, ...mensal.consumoKwh]);
  const altura = (v: number) => `${(Math.min(v, maximo) / maximo) * 100}%`;
  return (
    <div data-testid="geracao-mensal-proposta" className="mt-4 rounded-xl bg-carvao p-4 text-offwhite">
      <p className="text-sm font-semibold">Geração e consumo mês a mês</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-offwhite/75">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2.5 rounded-[2px] bg-dourado" />
          Geração estimada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2.5 rounded-[2px] bg-offwhite/45" />
          {legendaConsumo(mensal)}
        </span>
      </div>
      <div role="img" aria-label={descricaoGraficoMensal(mensal)} className="mt-3 grid h-36 grid-cols-12 gap-[3px] border-b border-offwhite/35">
        {MESES_ABREV.map((m, i) => (
          <div key={m} className="relative">
            <div className="absolute bottom-0 left-0 w-[55%] rounded-t-[2px] bg-dourado" style={{ height: altura(mensal.geracaoKwh[i] ?? 0) }} />
            <div className="absolute right-0 bottom-0 w-[40%] rounded-t-[2px] bg-offwhite/45" style={{ height: altura(mensal.consumoKwh[i] ?? 0) }} />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 grid grid-cols-12 gap-[3px] text-center text-[11px] text-offwhite/55">
        {MESES_ABREV.map((m) => (
          <span key={m}>
            <span className="sm:hidden">{m[0]}</span>
            <span className="hidden sm:inline">{m}</span>
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-offwhite/85">{NOTA_GERACAO_MENSAL}</p>
    </div>
  );
}
