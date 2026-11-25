/**
 * Exibição da projeção de 25 anos (proposta completa, PR 2b-2; prévia aprovada pelo Evandro em 25/11/2026). Puro.
 * Nunca mostra "0 meses" nem um número inventado: sem payback, a tela diz o motivo.
 */
import type { AnoProjecao, MotivoSemPayback } from "@/lib/projecao-financeira";

/** "4 anos e 7 meses", "11 meses", "5 anos"; nulo ou não positivo = nulo (a tela mostra o motivo). */
export function textoPaybackAnosMeses(meses: number | null | undefined): string | null {
  if (meses == null || !Number.isFinite(meses) || meses <= 0) return null;
  const total = Math.round(meses);
  const anos = Math.floor(total / 12);
  const resto = total % 12;
  const a = anos === 1 ? "1 ano" : `${anos} anos`;
  const m = resto === 1 ? "1 mês" : `${resto} meses`;
  if (anos === 0) return m;
  return resto === 0 ? a : `${a} e ${m}`;
}

/** Valor curto do payback quando não há número (cartão do resultado). */
export const ROTULO_SEM_PAYBACK: Record<MotivoSemPayback, string> = {
  inversor_sem_preco: "indisponível",
  sem_investimento: "indisponível",
  nao_se_paga_no_horizonte: "mais de 25 anos",
};

/** Por que não há payback, em linguagem do vendedor. */
export const TEXTO_SEM_PAYBACK: Record<MotivoSemPayback, string> = {
  inversor_sem_preco:
    "O inversor do kit não tem preço na tabela de preços, e sem ele não dá para prever a troca no ano 12. Peça a Compras para cadastrar e recalcule o kit.",
  sem_investimento: "Informe o valor do negócio para calcular o payback.",
  nao_se_paga_no_horizonte: "Com estas premissas, o sistema não se paga em 25 anos.",
};

export const MOTIVOS_SEM_PAYBACK: readonly MotivoSemPayback[] = ["sem_investimento", "inversor_sem_preco", "nao_se_paga_no_horizonte"];

export function ehMotivoSemPayback(v: unknown): v is MotivoSemPayback {
  return typeof v === "string" && (MOTIVOS_SEM_PAYBACK as readonly string[]).includes(v);
}

const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Anos da projeção gravada em `calculos_solares.projecao` (jsonb). Qualquer forma inesperada = nulo: a tela nunca
 * desenha a partir de dado que não confere.
 */
export function anosDaProjecaoSalva(projecao: unknown): AnoProjecao[] | null {
  if (!projecao || typeof projecao !== "object") return null;
  const anos = (projecao as { anos?: unknown }).anos;
  if (!Array.isArray(anos) || anos.length === 0) return null;
  const lidos: AnoProjecao[] = [];
  for (const a of anos) {
    if (!a || typeof a !== "object") return null;
    const x = a as Record<string, unknown>;
    if (![x.ano, x.anoCivilInicio, x.geracaoKwh, x.contaSemSolar, x.contaComSolar, x.economia, x.trocaInversor].every(numero)) return null;
    if (x.saldoAcumulado !== null && !numero(x.saldoAcumulado)) return null;
    lidos.push({
      ano: x.ano as number,
      anoCivilInicio: x.anoCivilInicio as number,
      geracaoKwh: x.geracaoKwh as number,
      contaSemSolar: x.contaSemSolar as number,
      contaComSolar: x.contaComSolar as number,
      economia: x.economia as number,
      trocaInversor: x.trocaInversor as number,
      saldoAcumulado: x.saldoAcumulado as number | null,
    });
  }
  return lidos.every((a, i) => a.ano === i + 1) ? lidos : null;
}

export type BarraSaldo = { ano: number; topoPct: number; alturaPct: number; positivo: boolean };

/**
 * Barras do saldo acumulado (gráfico de 25 anos): posição em % da altura, com a linha do zero em `zeroPct`. Nulo quando
 * algum ano não tem saldo (sem o preço do inversor).
 */
export function barrasDoSaldo(anos: AnoProjecao[]): { barras: BarraSaldo[]; zeroPct: number } | null {
  if (anos.length === 0 || anos.some((a) => a.saldoAcumulado == null)) return null;
  const saldos = anos.map((a) => a.saldoAcumulado as number);
  const max = Math.max(0, ...saldos);
  const min = Math.min(0, ...saldos);
  const amplitude = max - min || 1;
  const zero = max / amplitude;
  const barras = anos.map((a, i) => {
    const s = saldos[i];
    const h = Math.abs(s) / amplitude;
    return {
      ano: a.ano,
      topoPct: (s >= 0 ? zero - h : zero) * 100,
      // Fio mínimo para o ano de saldo zero não sumir.
      alturaPct: Math.max(h, 0.004) * 100,
      positivo: s >= 0,
    };
  });
  return { barras, zeroPct: zero * 100 };
}

/** Ano (1 a 25) em que o sistema se paga, pelo payback em meses. */
export function anoDoPayback(meses: number | null | undefined): number | null {
  if (meses == null || !Number.isFinite(meses) || meses <= 0) return null;
  return Math.ceil(meses / 12);
}
