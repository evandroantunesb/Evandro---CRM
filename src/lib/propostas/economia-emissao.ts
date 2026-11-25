/**
 * Economia na proposta emitida (proposta completa, PR 3; prévia aprovada pelo Evandro em 25/11/2026,
 * https://claude.ai/artifact/Ssu2hppCrLBEScXDHiNHuT). Puro, sem I/O.
 *
 * Regras:
 *  - A economia entra só se o modelo padrão tiver algum bloco de economia ATIVO ("Conta antes × depois", "Economia
 *    estimada" ou "Retorno/fluxo de caixa") E o cálculo do kit for do método v2, completo e vigente (nenhum motivo de
 *    desatualização). Senão a proposta sai SEM economia (decisão de 25/11/2026: não recusa a emissão).
 *  - O gestor escolhe no bloco "Retorno/fluxo de caixa" quantos anos o cliente vê (5, 10, 15, 20 ou 25; padrão 25). O
 *    cálculo continua com 25 anos: a proposta guarda só os anos mostrados, e o retorno aparece mesmo depois deles.
 *  - Sem payback (inversor sem preço, negócio sem valor ou fora dos 25 anos), a proposta mostra conta e economia e
 *    esconde o retorno e o gráfico.
 */
import { z } from "zod";
import { METODO_GD2_PISO_V2 } from "@/lib/calculadora";
import { anosDaProjecaoSalva } from "@/lib/projecao-exibicao";
import { PREMISSAS_PROJECAO } from "@/lib/projecao-financeira";

export const HORIZONTES_PROPOSTA = [5, 10, 15, 20, 25] as const;
export type HorizonteProposta = (typeof HORIZONTES_PROPOSTA)[number];
export const HORIZONTE_PADRAO: HorizonteProposta = 25;

/** Anos escolhidos no bloco "Retorno/fluxo de caixa" (`config.anos`); fora da lista = o padrão de 25. */
export function horizonteDoBloco(config: unknown): HorizonteProposta {
  const anos = config && typeof config === "object" ? (config as { anos?: unknown }).anos : undefined;
  const n = typeof anos === "string" ? Number(anos) : anos;
  return (HORIZONTES_PROPOSTA as readonly unknown[]).includes(n) ? (n as HorizonteProposta) : HORIZONTE_PADRAO;
}

export type BlocosEconomia = { conta: boolean; resumo: boolean; retorno: boolean };

/** Quais partes da economia o modelo mostra (blocos ativos) e o horizonte do bloco de retorno. */
export function economiaDoModelo(blocos: { tipo: string; ativo: boolean; config: unknown }[] | null | undefined): {
  blocos: BlocosEconomia;
  horizonteAnos: HorizonteProposta;
  algum: boolean;
} {
  const ativo = (tipo: string) => (blocos ?? []).some((b) => b.tipo === tipo && b.ativo);
  const retorno = (blocos ?? []).find((b) => b.tipo === "cashflow_payback");
  const b = { conta: ativo("before_after_bill"), resumo: ativo("savings_summary"), retorno: ativo("cashflow_payback") };
  return { blocos: b, horizonteAnos: horizonteDoBloco(retorno?.config), algum: b.conta || b.resumo || b.retorno };
}

const dinheiro = z.number().finite();
const fracao = z.number().finite().min(0).max(1);

/** O que a proposta emitida guarda da economia (congelado; nada é relido do cálculo depois). */
export const esquemaEconomiaEmitida = z.object({
  blocos: z.object({ conta: z.boolean(), resumo: z.boolean(), retorno: z.boolean() }),
  horizonteAnos: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(25)]),
  contaSemSolar: dinheiro.positive(),
  contaComSolar: dinheiro.nonnegative(),
  economiaMensal: dinheiro,
  economiaPrimeiroAno: dinheiro,
  /** Meses até o sistema se pagar; nulo = sem retorno (o card e o gráfico somem). */
  paybackMeses: z.number().int().positive().nullable(),
  investimento: dinheiro.positive(),
  /** Os anos mostrados (1..horizonte), com o saldo acumulado; o saldo é nulo sem o preço do inversor. */
  anos: z
    .array(z.object({ ano: z.number().int().positive(), economia: dinheiro, trocaInversor: dinheiro.nonnegative(), saldoAcumulado: dinheiro.nullable() }))
    .min(5)
    .max(25),
  economiaNoHorizonte: dinheiro,
  premissas: z.object({
    autoconsumo: fracao,
    icms: fracao,
    pisCofins: fracao,
    reajusteAnual: fracao,
    perdaPrimeiroAno: fracao,
    perdaAnual: fracao,
    anoTrocaInversor: z.number().int().positive(),
  }),
});
export type EconomiaEmitida = z.infer<typeof esquemaEconomiaEmitida>;

/** Colunas do cálculo salvo (`calculos_solares`) que a economia usa. */
export type CalculoParaEconomia = {
  estado_financeiro: string | null;
  metodo_calculo: string | null;
  conta_sem_solar: number | null;
  conta_com_solar: number | null;
  economia_mensal: number | null;
  economia_primeiro_ano: number | null;
  payback_meses: number | null;
  kit_preco: number;
  autoconsumo_fracao: number | null;
  icms: number | null;
  pis_cofins: number | null;
  projecao: unknown;
};

export type SituacaoEconomia =
  | { entra: true; economia: EconomiaEmitida }
  | { entra: false; motivo: "modelo_sem_blocos" | "sem_calculo" | "metodo_anterior" | "desatualizado" | "dados_incompletos" };

/** Texto do porquê de a economia ficar fora, para quem emite. */
export const TEXTO_ECONOMIA_FORA: Record<Extract<SituacaoEconomia, { entra: false }>["motivo"], string> = {
  modelo_sem_blocos: "fora da proposta: o modelo padrão não tem blocos de economia ligados",
  sem_calculo: "fora da proposta: o negócio ainda não tem o cálculo do kit com conta e economia",
  metodo_anterior: "fora da proposta: o cálculo do kit é do método anterior. Recalcule o kit para incluir",
  desatualizado: "fora da proposta: o cálculo do kit está desatualizado. Recalcule o kit para incluir",
  dados_incompletos: "fora da proposta: o cálculo salvo não tem a projeção completa. Recalcule o kit para incluir",
};

/**
 * Decide se a economia entra e monta o que a proposta guarda. `vigente` = `carregarVigencia` sem nenhum motivo (o
 * chamador passa falso em qualquer falha de leitura: nunca vale como vigente).
 */
export function situacaoDaEconomia(
  modelo: ReturnType<typeof economiaDoModelo>,
  calculo: CalculoParaEconomia | null,
  vigente: boolean,
): SituacaoEconomia {
  if (!modelo.algum) return { entra: false, motivo: "modelo_sem_blocos" };
  if (!calculo || calculo.estado_financeiro !== "completo") return { entra: false, motivo: "sem_calculo" };
  if (calculo.metodo_calculo !== METODO_GD2_PISO_V2) return { entra: false, motivo: "metodo_anterior" };
  if (!vigente) return { entra: false, motivo: "desatualizado" };

  const todos = anosDaProjecaoSalva(calculo.projecao);
  const premissas = (calculo.projecao as { premissas?: Record<string, unknown> } | null)?.premissas ?? {};
  const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  if (
    !todos ||
    todos.length < modelo.horizonteAnos ||
    calculo.conta_sem_solar == null ||
    calculo.conta_com_solar == null ||
    calculo.economia_mensal == null ||
    calculo.economia_primeiro_ano == null ||
    calculo.autoconsumo_fracao == null ||
    calculo.icms == null ||
    calculo.pis_cofins == null ||
    !(calculo.kit_preco > 0)
  ) {
    return { entra: false, motivo: "dados_incompletos" };
  }
  const anos = todos.slice(0, modelo.horizonteAnos).map((a) => ({ ano: a.ano, economia: a.economia, trocaInversor: a.trocaInversor, saldoAcumulado: a.saldoAcumulado }));
  const candidato = {
    blocos: modelo.blocos,
    horizonteAnos: modelo.horizonteAnos,
    contaSemSolar: Number(calculo.conta_sem_solar),
    contaComSolar: Number(calculo.conta_com_solar),
    economiaMensal: Number(calculo.economia_mensal),
    economiaPrimeiroAno: Number(calculo.economia_primeiro_ano),
    paybackMeses: calculo.payback_meses == null ? null : Math.round(Number(calculo.payback_meses)),
    investimento: Number(calculo.kit_preco),
    anos,
    economiaNoHorizonte: Math.round(anos.reduce((s, a) => s + a.economia, 0) * 100) / 100,
    premissas: {
      autoconsumo: Number(calculo.autoconsumo_fracao),
      icms: Number(calculo.icms),
      pisCofins: Number(calculo.pis_cofins),
      reajusteAnual: num(premissas.reajusteAnual, PREMISSAS_PROJECAO.reajusteAnual),
      perdaPrimeiroAno: num(premissas.perdaPrimeiroAno, PREMISSAS_PROJECAO.perdaPrimeiroAno),
      perdaAnual: num(premissas.perdaAnual, PREMISSAS_PROJECAO.perdaAnual),
      anoTrocaInversor: num(premissas.anoTrocaInversor, PREMISSAS_PROJECAO.anoTrocaInversor),
    },
  };
  const lido = esquemaEconomiaEmitida.safeParse(candidato);
  return lido.success ? { entra: true, economia: lido.data } : { entra: false, motivo: "dados_incompletos" };
}

/**
 * O que a tela de emissão mostra: se a economia entra (e com quantos anos) ou o porquê de ficar fora. Recebe o
 * resultado de `carregarVigencia` (nulo ou falha de leitura = nunca vigente).
 */
export function avisoDaEconomia(
  blocosDoModelo: Parameters<typeof economiaDoModelo>[0],
  carregamento: { ok: false } | { ok: true; calculo: null } | { ok: true; calculo: CalculoParaEconomia; vigencia: { vigente: boolean } } | null,
): { entra: boolean; horizonteAnos: number | null; texto: string | null } {
  const lido = carregamento?.ok === true && carregamento.calculo != null ? carregamento : null;
  const s = situacaoDaEconomia(economiaDoModelo(blocosDoModelo), lido?.calculo ?? null, lido?.vigencia.vigente === true);
  return s.entra ? { entra: true, horizonteAnos: s.economia.horizonteAnos, texto: null } : { entra: false, horizonteAnos: null, texto: TEXTO_ECONOMIA_FORA[s.motivo] };
}

/** Saldo no último ano mostrado; nulo sem o preço do inversor. */
export function saldoNoHorizonte(e: EconomiaEmitida): number | null {
  return e.anos[e.anos.length - 1]!.saldoAcumulado;
}

/** O payback cai depois dos anos mostrados (o gráfico fica todo "pagando" e a proposta avisa). */
export function paybackDepoisDoHorizonte(e: EconomiaEmitida): boolean {
  return e.paybackMeses != null && Math.ceil(e.paybackMeses / 12) > e.horizonteAnos;
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Premissas da economia, como a proposta as mostra ao cliente. */
export function textoPremissasEconomia(e: EconomiaEmitida): string {
  const p = e.premissas;
  const troca = e.paybackMeses != null && e.horizonteAnos >= p.anoTrocaInversor ? `, troca do inversor no ano ${p.anoTrocaInversor} pelo preço de hoje` : "";
  return (
    `Premissas: autoconsumo de ${pct(p.autoconsumo)}, ICMS ${pct(p.icms)} e PIS/Cofins ${pct(p.pisCofins)}, reajuste da tarifa de ` +
    `${pct(p.reajusteAnual)} ao ano, perda dos módulos de ${pct(p.perdaPrimeiroAno)} no 1º ano e ${pct(p.perdaAnual)} ao ano depois, ` +
    `Fio B de 60% (2026) a 100% (a partir de 2029)${troca}. Bandeiras tarifárias e iluminação pública ficam fora.`
  );
}
