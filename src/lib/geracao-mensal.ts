/**
 * Geração e consumo mês a mês (proposta completa, PR 4; desenho em
 * docs/superpowers/specs/2026-11-25-geracao-mensal-design.md). Puro, sem I/O.
 *
 * A curva da empresa (12 valores, qualquer unidade) só redistribui o ano: a soma dos 12 meses é sempre a geração
 * mensal × 12. Economia, payback e cobertura continuam pela média.
 */
import { lerNumeroBr } from "@/lib/formatacao";

export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
export const MESES_NOMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const curvaValida = (curva: readonly number[]) => curva.length === 12 && curva.every((v) => Number.isFinite(v) && v > 0);

/**
 * Geração de cada mês em kWh inteiros: total do ano (`geracaoKwhMes × 12`, arredondado) repartido pela proporção da
 * curva. Os kWh que sobram do arredondamento vão aos meses de maior resto (empate: o mês mais cedo), então a soma é
 * exata. Curva sem 12 valores positivos ou geração sem valor: nulo.
 */
export function distribuirGeracaoMensal(geracaoKwhMes: number, curva: readonly number[]): number[] | null {
  if (!(Number.isFinite(geracaoKwhMes) && geracaoKwhMes > 0) || !curvaValida(curva)) return null;
  const total = Math.round(geracaoKwhMes * 12);
  const somaCurva = curva.reduce((a, b) => a + b, 0);
  const bruto = curva.map((c) => (total * c) / somaCurva);
  const meses = bruto.map(Math.floor);
  const falta = total - meses.reduce((a, b) => a + b, 0);
  bruto
    .map((b, i) => ({ resto: b - Math.floor(b), i }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
    .slice(0, falta)
    .forEach(({ i }) => {
      meses[i] = meses[i]! + 1;
    });
  return meses;
}

const campo = (prefixo: string, i: number) => `${prefixo}${String(i + 1).padStart(2, "0")}`;

/** Algum dos 12 campos veio no formulário (mesmo vazio). */
export function algumMesPresente(entrada: Record<string, unknown>, prefixo: string): boolean {
  return MESES_ABREV.some((_, i) => campo(prefixo, i) in entrada);
}

/**
 * Lê `${prefixo}01` a `${prefixo}12` (formato brasileiro). Os 12 ou nenhum: todos vazios (ou ausentes) = nulo; alguns
 * vazios = recusa dizendo quais. `positivo` exige > 0 (curva); `zero_ou_mais` aceita 0 (consumo).
 */
export function lerDozeMeses(
  entrada: Record<string, unknown>,
  prefixo: string,
  minimo: "positivo" | "zero_ou_mais",
  rotulo: string,
): { ok: true; valores: number[] | null } | { ok: false; mensagem: string } {
  const textos = MESES_ABREV.map((_, i) => {
    const v = entrada[campo(prefixo, i)];
    return typeof v === "string" ? v.trim() : "";
  });
  const vazios = MESES_ABREV.filter((_, i) => textos[i] === "");
  if (vazios.length === 12) return { ok: true, valores: null };
  if (vazios.length > 0) {
    const n = vazios.length;
    return { ok: false, mensagem: `Falta${n > 1 ? "m" : ""} ${n} ${n > 1 ? "meses" : "mês"} de ${rotulo} (${vazios.join(", ")}). Preencha os 12 ou deixe todos vazios.` };
  }
  const valores: number[] = [];
  for (let i = 0; i < 12; i++) {
    const n = lerNumeroBr(textos[i]);
    const ok = n != null && Number.isFinite(n) && (minimo === "positivo" ? n > 0 : n >= 0);
    if (!ok) return { ok: false, mensagem: `${rotulo}: valor inválido em ${MESES_NOMES[i]}.` };
    valores.push(n);
  }
  return { ok: true, valores };
}

/** O que a coluna `numeric(8, 3)` guarda sem arredondar para zero nem estourar. */
const CURVA_MINIMO = 0.001;
const CURVA_MAXIMO = 99999.999;

/**
 * Curva da empresa no formulário de parâmetros (`curva_mes_01` a `curva_mes_12`): 12 valores > 0 ou nenhum, cada um
 * entre 0,001 e 99.999,999 (o que o banco guarda); fora disso, recusa citando o mês.
 */
export function lerCurvaDoFormulario(entrada: Record<string, unknown>): ReturnType<typeof lerDozeMeses> {
  const r = lerDozeMeses(entrada, "curva_mes_", "positivo", "curva de geração");
  if (!r.ok || !r.valores) return r;
  const fora = r.valores.findIndex((v) => v < CURVA_MINIMO || v > CURVA_MAXIMO);
  if (fora < 0) return r;
  return {
    ok: false,
    mensagem: `curva de geração: use valores de 0,001 a 99.999,999 (${MESES_NOMES[fora]}). Na mesma unidade, só a proporção entre os meses conta.`,
  };
}

/** Média dos meses em kWh inteiros. */
export function mediaDosMeses(valores: readonly number[]): number {
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Série do gráfico (a mesma forma que a proposta emitida congela, ver `MensalEmitido`). */
export type SerieMensal = { geracaoKwh: readonly number[]; consumoKwh: readonly number[]; consumoOrigem: "informado" | "media" };

/** Nota aprovada do gráfico (prévia de 25/11/2026), sem nomear a distribuidora. */
export const NOTA_GERACAO_MENSAL =
  "No verão o sistema gera mais e no inverno, menos. O excedente vira crédito na distribuidora e compensa os meses de menor geração (validade de 60 meses).";

const kwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;

/** Legenda da série de consumo: os 12 meses informados ou a média do negócio. */
export function legendaConsumo(s: SerieMensal): string {
  return s.consumoOrigem === "media" ? `Seu consumo médio (${kwh(s.consumoKwh[0] ?? 0)})` : "Seu consumo";
}

const extremos = (v: readonly number[]) => ({ maior: v.indexOf(Math.max(...v)), menor: v.indexOf(Math.min(...v)) });

/** Linha abaixo do gráfico do PDF: mês de maior e de menor geração e o total do ano. */
export function resumoGeracaoMensal(s: SerieMensal): string {
  const { maior, menor } = extremos(s.geracaoKwh);
  const ano = s.geracaoKwh.reduce((a, b) => a + b, 0);
  return `Maior geração: ${MESES_ABREV[maior]} ${kwh(s.geracaoKwh[maior]!)} · Menor: ${MESES_ABREV[menor]} ${kwh(s.geracaoKwh[menor]!)} · Ano: ${kwh(ano)}`;
}

/** Descrição do gráfico para leitores de tela. */
export function descricaoGraficoMensal(s: SerieMensal): string {
  const { maior, menor } = extremos(s.geracaoKwh);
  const consumo =
    s.consumoOrigem === "media"
      ? `consumo médio de ${kwh(s.consumoKwh[0] ?? 0)} por mês`
      : `consumo de ${Math.round(Math.min(...s.consumoKwh)).toLocaleString("pt-BR")} a ${kwh(Math.max(...s.consumoKwh))} por mês`;
  return `Geração estimada de ${kwh(s.geracaoKwh[menor]!)} em ${MESES_ABREV[menor]} a ${kwh(s.geracaoKwh[maior]!)} em ${MESES_ABREV[maior]}; ${consumo}.`;
}

/** Menor degrau do eixo (kWh): mesmo sem valor, as marcas saem inteiras (0, 50, 100, 150, 200). */
const DEGRAU_MINIMO = 50;

/**
 * Eixo do gráfico em 4 degraus iguais e redondos (1, 2, 2,5 ou 5 × 10ⁿ, no mínimo 50 kWh), o menor que cobre o maior
 * valor; 5 marcas do topo até zero, todas inteiras.
 */
export function escalaDoGrafico(valores: readonly number[]): { maximo: number; marcas: number[] } {
  const maior = Math.max(0, ...valores.filter(Number.isFinite));
  const alvo = Math.max(DEGRAU_MINIMO, maior / 4);
  const potencia = 10 ** Math.floor(Math.log10(alvo));
  const degrau = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((d) => d >= alvo)!;
  return { maximo: degrau * 4, marcas: [4, 3, 2, 1, 0].map((k) => degrau * k) };
}
