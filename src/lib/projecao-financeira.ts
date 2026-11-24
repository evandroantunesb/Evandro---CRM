/**
 * Projeção financeira de 25 anos da estimativa GD II (proposta completa, PR 2a; premissas aprovadas pelo Evandro em
 * 24/11/2026, registradas em docs/PROJECT_STATUS.md, seção "Proposta comercial completa"). Puro, sem I/O.
 *
 * Mês a mês, a conta usa o motor aprovado (`calcularFioBGd2`: piso da REN 1.000, art. 655-I) com:
 *  - tributos "por dentro" (ICMS e PIS/Cofins da empresa) sobre a tarifa e sobre o Fio B pago; a energia compensada
 *    não paga a tarifa (isenção da Lei PR 19.595/2018 e da Lei 13.169/2015, art. 8º), só o Fio B, tratado como
 *    tributado enquanto as faturas reais não confirmam (lado conservador, decisão de 24/11/2026);
 *  - autoconsumo simultâneo = fração da geração consumida na hora (padrão residencial 30%), limitado ao consumo;
 *  - percentual do Fio B pelo ano do mês: 60% (2026), 75% (2027) e 90% (2028) pela Lei 14.300, e 100% a partir de
 *    2029 (premissa: a regra da ANEEL ainda não saiu);
 *  - tarifa e Fio B reajustados 5% a cada ano de projeção; geração com a perda do módulo (1% no 1º ano e 0,4% ao ano,
 *    linear, como a garantia: o ano n usa o fim do ano n, o lado conservador).
 * O investimento é o valor da proposta, pago no início; a troca do inversor sai no início do ano 12, pelo preço atual
 * do inversor do kit. Sem esse preço não há payback nem saldo (decisão de 24/11/2026: nunca inventar o valor), mas a
 * economia continua. Ficam fora: bandeiras, iluminação pública, financiamento e correção do dinheiro no tempo.
 */
import { arredondar2, calcularFioBGd2 } from "@/lib/fio-b-gd2";
import { PERCENTUAL_LEGAL_FIO_B_GD2 } from "@/lib/tarifa-gd";

export const METODO_PROJECAO_V1 = "projecao_25a_v1" as const;

/** Premissas aprovadas em 24/11/2026; o chamador só muda o que tem dado melhor (ex.: a perda da ficha do módulo). */
export const PREMISSAS_PROJECAO = {
  horizonteAnos: 25,
  reajusteAnual: 0.05,
  perdaPrimeiroAno: 0.01,
  perdaAnual: 0.004,
  anoTrocaInversor: 12,
  autoconsumoResidencial: 0.3,
  icmsPadrao: 0.19,
  pisCofinsPadrao: 0.0763,
} as const;

/** Fio B pago sobre a energia compensada, pelo ano civil: lei até 2028, 100% depois (premissa aprovada). */
export function percentualFioBProjecao(ano: number): number | null {
  if (!Number.isInteger(ano) || ano < 2026) return null;
  if (ano >= 2029) return 1;
  return PERCENTUAL_LEGAL_FIO_B_GD2[ano] ?? (ano === 2028 ? 0.9 : null);
}

/** Fração da geração nominal no ano de projeção n (1 = primeiro ano), no fim do ano. */
export function fatorGeracao(n: number, perdaPrimeiroAno: number = PREMISSAS_PROJECAO.perdaPrimeiroAno, perdaAnual: number = PREMISSAS_PROJECAO.perdaAnual): number {
  return 1 - perdaPrimeiroAno - perdaAnual * (n - 1);
}

/** Valor sem tributos levado à base com tributos "por dentro": v / (1 − ICMS − PIS/Cofins). */
export function comTributos(valor: number, icms: number, pisCofins: number): number {
  return valor / (1 - icms - pisCofins);
}

export type EntradaProjecao = {
  consumoMensalKwh: number;
  /** Geração nominal (potência × produtividade), antes da perda do módulo. */
  geracaoMensalKwh: number;
  /** Fração da geração consumida na hora (0 a 1). */
  autoconsumoFracao: number;
  /** TE + TUSD sem tributos, R$/kWh (tarifa oficial da ANEEL). */
  tarifaSemTributosRsKwh: number;
  /** TUSD Fio B sem tributos, R$/kWh. */
  fioBSemTributosRsKwh: number;
  icms: number;
  pisCofins: number;
  custoDisponibilidadeKwh: number;
  /** Mês em que a projeção começa (AAAA-MM). */
  mesInicio: string;
  /** Valor da proposta (R$). */
  investimento: number;
  /** Preço atual do inversor do kit (R$); nulo = desconhecido (sem payback). */
  precoInversor: number | null;
  /** Só o que tiver dado melhor que o padrão aprovado. */
  premissas?: Partial<Record<"horizonteAnos" | "reajusteAnual" | "perdaPrimeiroAno" | "perdaAnual" | "anoTrocaInversor", number>>;
};

export type AnoProjecao = {
  ano: number;
  anoCivilInicio: number;
  geracaoKwh: number;
  contaSemSolar: number;
  contaComSolar: number;
  economia: number;
  /** Troca do inversor paga neste ano (R$; 0 nos demais). */
  trocaInversor: number;
  /** Economia acumulada − investimento − trocas até o fim do ano; nulo sem o preço do inversor. */
  saldoAcumulado: number | null;
};

export type ResultadoProjecao =
  | {
      ok: true;
      metodo: typeof METODO_PROJECAO_V1;
      /** Primeiro mês da projeção (tarifa de hoje, geração do 1º ano). */
      primeiroMes: { contaSemSolar: number; contaComSolar: number; economia: number };
      economiaPrimeiroAno: number;
      anos: AnoProjecao[];
      economiaTotal: number;
      /**
       * Primeiro mês em que a economia acumulada cobre o investimento e as trocas já pagas até ali; nulo = sem preço do
       * inversor ou não se paga no horizonte.
       */
      paybackMeses: number | null;
      /** Economia total − investimento − trocas; nulo sem o preço do inversor. */
      saldoFinal: number | null;
      motivoSemPayback: "inversor_sem_preco" | "nao_se_paga_no_horizonte" | null;
      premissas: {
        horizonteAnos: number;
        reajusteAnual: number;
        perdaPrimeiroAno: number;
        perdaAnual: number;
        anoTrocaInversor: number;
        autoconsumoFracao: number;
        icms: number;
        pisCofins: number;
        tarifaComTributosRsKwh: number;
      };
    }
  | { ok: false; motivo: string };

const falha = (motivo: string): ResultadoProjecao => ({ ok: false, motivo });
const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function lerMes(mes: string): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const ano = Number(m[1]);
  const numero = Number(m[2]);
  return numero >= 1 && numero <= 12 ? { ano, mes: numero } : null;
}

export function projetarEconomia(e: EntradaProjecao): ResultadoProjecao {
  const p = { ...PREMISSAS_PROJECAO, ...e.premissas };
  const inicio = lerMes(e.mesInicio);
  if (!inicio) return falha("Mês de início inválido (use AAAA-MM).");
  const numeros = [e.consumoMensalKwh, e.geracaoMensalKwh, e.autoconsumoFracao, e.tarifaSemTributosRsKwh, e.fioBSemTributosRsKwh, e.icms, e.pisCofins, e.custoDisponibilidadeKwh, e.investimento];
  if (!numeros.every(finito)) return falha("Todos os valores precisam ser números finitos.");
  if (e.precoInversor != null && !(finito(e.precoInversor) && e.precoInversor > 0)) return falha("O preço do inversor precisa ser positivo.");
  if (!(e.consumoMensalKwh > 0)) return falha("O consumo precisa ser maior que zero.");
  if (!(e.geracaoMensalKwh > 0)) return falha("A geração precisa ser maior que zero.");
  if (e.autoconsumoFracao < 0 || e.autoconsumoFracao > 1) return falha("O autoconsumo precisa estar entre 0% e 100%.");
  if (e.icms < 0 || e.pisCofins < 0 || e.icms + e.pisCofins >= 0.6) return falha("ICMS e PIS/Cofins fora da faixa esperada.");
  if (!(e.tarifaSemTributosRsKwh > 0) || e.fioBSemTributosRsKwh < 0) return falha("Tarifa e Fio B inválidos.");
  if (!(e.investimento > 0)) return falha("O investimento precisa ser maior que zero.");
  if (!(Number.isInteger(p.horizonteAnos) && p.horizonteAnos >= 1 && p.horizonteAnos <= 40)) return falha("Horizonte inválido.");
  if (!(Number.isInteger(p.anoTrocaInversor) && p.anoTrocaInversor >= 2)) return falha("Ano da troca do inversor inválido.");
  if (fatorGeracao(p.horizonteAnos, p.perdaPrimeiroAno, p.perdaAnual) <= 0) return falha("A perda do módulo zera a geração no horizonte.");

  const T0 = comTributos(e.tarifaSemTributosRsKwh, e.icms, e.pisCofins);
  const fioB0 = comTributos(e.fioBSemTributosRsKwh, e.icms, e.pisCofins);
  const temPreco = e.precoInversor != null;

  const anos: AnoProjecao[] = [];
  let primeiroMes: { contaSemSolar: number; contaComSolar: number; economia: number } | null = null;
  let acumulado = -e.investimento;
  let payback: number | null = null;
  let economiaTotal = 0;

  for (let n = 1; n <= p.horizonteAnos; n++) {
    const reajuste = (1 + p.reajusteAnual) ** (n - 1);
    const geracao = e.geracaoMensalKwh * fatorGeracao(n, p.perdaPrimeiroAno, p.perdaAnual);
    const autoconsumo = Math.min(geracao * e.autoconsumoFracao, e.consumoMensalKwh);
    const troca = n === p.anoTrocaInversor && temPreco ? e.precoInversor! : 0;
    acumulado -= troca;
    const ano = { contaSemSolar: 0, contaComSolar: 0, economia: 0 };
    for (let m = 0; m < 12; m++) {
      const indice = (n - 1) * 12 + m;
      const anoCivil = inicio.ano + Math.floor((inicio.mes - 1 + indice) / 12);
      const percentual = percentualFioBProjecao(anoCivil);
      if (percentual == null) return falha(`Sem percentual do Fio B para ${anoCivil}.`);
      const r = calcularFioBGd2({
        consumoTotalKwh: e.consumoMensalKwh,
        geracaoTotalKwh: geracao,
        autoconsumoInstantaneoKwh: autoconsumo,
        tarifaCheiaRsKwh: T0 * reajuste,
        custoDisponibilidadeKwh: e.custoDisponibilidadeKwh,
        custoEnergiaCompensadaRsKwh: percentual * fioB0 * reajuste,
      });
      if (!r.ok) return falha(r.motivo);
      if (!primeiroMes) primeiroMes = { contaSemSolar: r.contaSemSolar, contaComSolar: r.contaComSolar, economia: r.economiaMensal };
      ano.contaSemSolar += r.contaSemSolar;
      ano.contaComSolar += r.contaComSolar;
      ano.economia += r.economiaMensal;
      acumulado += r.economiaMensal;
      if (temPreco && payback == null && acumulado >= 0) payback = indice + 1;
    }
    economiaTotal += ano.economia;
    anos.push({
      ano: n,
      anoCivilInicio: inicio.ano + Math.floor((inicio.mes - 1 + (n - 1) * 12) / 12),
      geracaoKwh: arredondar2(geracao * 12),
      contaSemSolar: arredondar2(ano.contaSemSolar),
      contaComSolar: arredondar2(ano.contaComSolar),
      economia: arredondar2(ano.economia),
      trocaInversor: arredondar2(troca),
      saldoAcumulado: temPreco ? arredondar2(acumulado) : null,
    });
  }

  return {
    ok: true,
    metodo: METODO_PROJECAO_V1,
    primeiroMes: primeiroMes!,
    economiaPrimeiroAno: anos[0]!.economia,
    anos,
    economiaTotal: arredondar2(economiaTotal),
    paybackMeses: temPreco ? payback : null,
    saldoFinal: temPreco ? arredondar2(acumulado) : null,
    motivoSemPayback: !temPreco ? "inversor_sem_preco" : payback == null ? "nao_se_paga_no_horizonte" : null,
    premissas: {
      horizonteAnos: p.horizonteAnos,
      reajusteAnual: p.reajusteAnual,
      perdaPrimeiroAno: p.perdaPrimeiroAno,
      perdaAnual: p.perdaAnual,
      anoTrocaInversor: p.anoTrocaInversor,
      autoconsumoFracao: e.autoconsumoFracao,
      icms: e.icms,
      pisCofins: e.pisCofins,
      tarifaComTributosRsKwh: T0,
    },
  };
}
