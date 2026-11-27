/**
 * Textos que acompanham a economia na proposta (esquema 9; aprovados pelo Evandro em 26/11/2026, opções A da prévia
 * https://claude.ai/artifact/7He2QtGYErNp4eKubQz4tX). Puro, sem I/O.
 *
 *  - "Como funciona a conta com energia solar": o Fio B da Lei 14.300/2022 ano a ano e a premissa de 100% a partir de
 *    2029 (a mesma da projeção, `percentualFioBProjecao`), sem nomear a distribuidora.
 *  - Parcela × economia: a menor parcela do financiamento ao lado da economia do primeiro mês, sem conclusão (a
 *    economia é estimativa; a proposta não promete que ela paga a parcela).
 */
import type { CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda } from "@/lib/formatacao";

export type AnoFioB = { ano: number; percentual: number; premissa: boolean };

/** Parcela do Fio B paga por ano: 2023 a 2028 pela Lei 14.300/2022; 2029 em diante, premissa desta proposta. */
export const ANOS_FIO_B_PROPOSTA: readonly AnoFioB[] = [
  { ano: 2023, percentual: 0.15, premissa: false },
  { ano: 2024, percentual: 0.3, premissa: false },
  { ano: 2025, percentual: 0.45, premissa: false },
  { ano: 2026, percentual: 0.6, premissa: false },
  { ano: 2027, percentual: 0.75, premissa: false },
  { ano: 2028, percentual: 0.9, premissa: false },
  { ano: 2029, percentual: 1, premissa: true },
];

export const TITULO_FIO_B = "Como funciona a conta com energia solar";

export const PARAGRAFOS_FIO_B: readonly string[] = [
  'Pela Lei 14.300/2022, quem instala energia solar a partir de 2023 paga aos poucos uma parte da tarifa de uso da rede (o "Fio B") sobre a energia que envia à distribuidora e usa depois. Essa parte sobe ano a ano: 60% em 2026, 75% em 2027 e 90% em 2028.',
  "Para os anos seguintes, a regra da ANEEL ainda não foi publicada. Por prudência, esta proposta considera 100% a partir de 2029, e a economia mostrada já desconta o Fio B de cada ano.",
  "A conta nunca zera: continuam a taxa mínima da distribuidora (custo de disponibilidade) e a iluminação pública.",
];

export const NOTA_FIO_B_PREMISSA = "* Premissa desta proposta; a regra para depois de 2028 ainda será definida pela ANEEL.";

/** Rótulo de um ano no gráfico: "2026", e "2029+" no ano da premissa. */
export const rotuloAnoFioB = (a: AnoFioB) => (a.premissa ? `${a.ano}+` : String(a.ano));
/** Percentual de um ano no gráfico: "60%", e "100%*" no ano da premissa. */
export const rotuloPercentualFioB = (a: AnoFioB) => `${Math.round(a.percentual * 100)}%${a.premissa ? "*" : ""}`;

const reais = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/**
 * Frase abaixo do financiamento: a menor parcela (empate: a de menor entrada) e a economia do primeiro mês. Sem
 * financiamento ou sem economia positiva, nula.
 */
export function fraseParcelaEconomia(condicoes: CondicoesEmitidas, economiaMensal: number): string | null {
  const opcoes = condicoes.financiamento?.opcoes ?? [];
  if (opcoes.length === 0 || !(economiaMensal > 0)) return null;
  const menor = [...opcoes].sort((a, b) => a.valorParcela - b.valorParcela || a.entrada - b.entrada)[0]!;
  const qual = opcoes.length > 1 ? "a menor parcela" : "a parcela";
  const entrada = menor.entrada > 0 ? `com entrada de ${formatarMoeda(menor.entrada)}` : "sem entrada";
  return (
    `Para comparar: ${qual} do financiamento é de ${formatarMoeda(menor.valorParcela)} (${menor.parcelas}x, ${entrada}) ` +
    `e a economia estimada na conta de energia é de ${reais(economiaMensal)} no primeiro mês.`
  );
}
