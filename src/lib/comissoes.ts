import type { TipoCalculoComissao } from "@/lib/tipos";

/** Uma faixa de resultado do plano de comissão (guardada em jsonb). */
export type FaixaComissao = {
  resultado_minimo: number;
  resultado_maximo: number | null;
  valor: number;
};

/** Faixa cujo intervalo [resultado_minimo, resultado_maximo) contém o resultado, ou null se nenhuma cobrir. */
export function encontrarFaixa(faixas: FaixaComissao[], resultado: number): FaixaComissao | null {
  return (
    faixas.find(
      (f) => resultado >= f.resultado_minimo && (f.resultado_maximo === null || resultado < f.resultado_maximo),
    ) ?? null
  );
}

/** Valor da comissão a partir da faixa aplicável: percentual (ex.: 5 = 5%) ou multiplicador direto sobre o resultado. */
export function calcularValorComissao(tipoCalculo: TipoCalculoComissao, faixa: FaixaComissao | null, resultado: number): number {
  if (!faixa) return 0;
  return tipoCalculo === "percentual" ? resultado * (faixa.valor / 100) : resultado * faixa.valor;
}
