/**
 * Cálculo solar reproduzível a partir do que fica gravado (funções puras, sem Supabase e sem "server-only").
 *
 * As entradas usadas em `calcular` (consumo, tarifa, potência, preço, fatura) são as MESMAS que serão persistidas
 * em `calculos_solares`, na escala das colunas.
 *
 * Estados gravados (migrations 20261023200000 e 20261023210000):
 *  - `completo`: regra aceita (`calcular`, ramo `completa`) com o retrato do que foi usado (data, tarifa e base,
 *    linha oficial, Fio B, percentual legal, vigência, piso, autoconsumo, ressalvas). Payback nulo (P0).
 *  - `incompleto`: resultado técnico sem parte financeira, com as pendências E as novas entradas (tarifa, base,
 *    data e, quando resolvidos, linha oficial e percentual), para que a linha corresponda ao que foi digitado.
 * Conta em R$ sem kWh não tem linha (`linha: null`: a coluna de consumo exige kWh). Linhas `legado` foram geradas
 * pela fórmula antiga e não são reproduzíveis por `calcular`.
 * Toda linha nova sai com `financeiro_desatualizado_em` nulo (R6.3: recalcular limpa a marca).
 */
import { calcular, type EntradaCalculo } from "@/lib/calculadora";
import { consumoComoPersistido, valorComoPersistido } from "@/lib/consumo-persistido";
import { avaliarEstimativa, listaDePendencias, type Pendencia } from "@/lib/estimativa-financeira";
import { calcularFioBGd2 } from "@/lib/fio-b-gd2";
import type { Database } from "@/lib/supabase/database.types";
import {
  disponibilidadeArt291,
  enquadramentoDoTipoCliente,
  percentualLegalFioB,
  resolverTarifa,
  rotuloEnquadramento,
  tarifaOficialRsKwh,
  type BaseTributaria,
  type ContextoEstimativa,
} from "@/lib/tarifa-gd";
import type { TipoLigacao } from "@/lib/tipos";

export type LinhaCalculo = Omit<
  Database["public"]["Tables"]["calculos_solares"]["Insert"],
  "negocio_id" | "observacoes" | "atualizado_por" | "criado_por"
>;

// Contrato anterior preservado: a implementação mora em `consumo-persistido` (sem dependências).
export { consumoComoPersistido, valorComoPersistido };

/** Escalas de `calculos_solares` (migrations 20260926000100_calculadora.sql e 20261023210000). */
export const CASAS_TARIFA = 5; // tarifa_kwh numeric(9,5)
const CASAS_POTENCIA = 2; // kit_potencia_kwp numeric(6,2)
const CASAS_PRECO = 2; // kit_preco numeric(12,2)
const CASAS_FATURA = 2; // valor_fatura_medio numeric(12,2)

const MENSAGEM_POTENCIA = "Informe ao menos um módulo com potência para calcular.";
const MENSAGEM_TARIFA = "Informe uma tarifa maior que zero (o banco guarda 5 casas).";
const MENSAGEM_PRECO = "Informe um preço do kit válido (maior ou igual a zero).";
const MENSAGEM_CONSUMO = "Informe um consumo maior que zero (o banco guarda 2 casas).";

export type EntradaLinhaCalculo = {
  kitNome: string;
  potenciaKwp: number;
  precoKit: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number | null;
  valorFaturaMedio: number | null;
  tarifaKwh: number;
  /** Base declarada da tarifa; nula = não declarada (pendência). */
  tarifaBaseTributaria?: BaseTributaria | null;
};

/** Campos de `parametros_calculadora` usados no cálculo. */
export type ParametrosCalculo = {
  produtividade_kwh_kwp_mes: number;
  percentual_fio_b: number;
  disponibilidade_mono_kwh: number;
  disponibilidade_bi_kwh: number;
  disponibilidade_tri_kwh: number;
};

/**
 * `incompleta: true` = estimativa financeira incompleta (não é entrada inválida). O cálculo financeiro não é gerado;
 * quem chama salva negócio e kit, grava `linha` (resultado técnico) quando houver e repassa `mensagem` como aviso.
 */
export type ResultadoLinha =
  | { ok: true; linha: LinhaCalculo }
  | { ok: false; mensagem: string; incompleta?: undefined }
  | {
      ok: false;
      mensagem: string;
      incompleta: true;
      pendencias: Pendencia[];
      potenciaKwp: number | null;
      geracaoEstimadaKwhMes: number | null;
      /** Resultado técnico a gravar como `incompleto`; nulo quando não há consumo em kWh. */
      linha: LinhaCalculo | null;
    };

/** Texto do aviso de estimativa incompleta (kit salvo; parte financeira ausente). */
export function mensagemEstimativaIncompleta(pendencias: Pendencia[]): string {
  return `Estimativa financeira incompleta: ${listaDePendencias(pendencias)}.`;
}

/** Pendências de uma entrada que não chega ao motor (ex.: conta em R$ sem kWh, kit ainda sem módulo). */
export function pendenciasDaEntrada(
  entrada: {
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number | null;
    tarifaBaseTributaria?: BaseTributaria | null;
  },
  contexto: ContextoEstimativa | null = null,
): Pendencia[] {
  return avaliarEstimativa({
    contexto,
    tarifaBaseRsKwh: entrada.tarifaKwh,
    tarifaBaseBaseTributaria: entrada.tarifaBaseTributaria ?? null,
    consumoMedioKwh: entrada.consumoMedioKwh,
    consumoOrigem: entrada.consumoMedioKwh == null && entrada.valorFaturaMedio != null ? "estimado_conta" : "informado",
    tarifaEfetivaContaRsKwh: null,
  }).pendencias;
}

/** Validações da entrada (antes de consultar parâmetros). `null` = entrada aceita. */
export function problemaDaEntrada(entrada: Pick<EntradaLinhaCalculo, "consumoMedioKwh" | "valorFaturaMedio" | "potenciaKwp">): string | null {
  if (entrada.consumoMedioKwh == null && entrada.valorFaturaMedio == null) {
    return "Informe o consumo médio ou o valor médio da fatura.";
  }
  if (entrada.potenciaKwp <= 0) {
    return MENSAGEM_POTENCIA;
  }
  return null;
}

/**
 * Novas entradas do resultado INCOMPLETO (R6 / contrato, seção 5): tarifa e base declaradas, data e, quando o contexto
 * resolve, a linha oficial e o percentual legal. Nada aqui é número financeiro.
 */
function entradasRegistradas(contexto: ContextoEstimativa | null, tarifaKwh: number, base: BaseTributaria | null) {
  // Todas as colunas do retrato vão explícitas (nulas quando não resolvidas): o upsert só atualiza o que recebe, e um
  // retrato antigo não pode sobrar numa linha nova (pareceria corresponder às entradas atuais).
  const registro: Partial<LinhaCalculo> = {
    data_referencia: contexto?.dataReferencia ?? null,
    tarifa_base_tributaria: base,
    tarifa_origem: "informada_vendedor",
    percentual_legal_fio_b: contexto ? percentualLegalFioB(contexto.dataReferencia) : null,
    tarifa_gd_id: null,
    distribuidora: null,
    enquadramento: null,
    fio_b_rs_mwh: null,
    fio_b_base_tributaria: null,
    fio_b_vigencia_inicio: null,
    fio_b_vigencia_fim: null,
  };
  const enq = enquadramentoDoTipoCliente(contexto?.tipoCliente);
  if (!contexto || enq.situacao !== "ok") return registro;
  const t = resolverTarifa(contexto.tarifas, contexto.distribuidoraInformada, enq.enquadramento, contexto.dataReferencia);
  if (t.situacao !== "ok") return registro;
  return {
    ...registro,
    tarifa_origem: tarifaKwh === tarifaOficialRsKwh(t.tarifa) ? ("oficial_aneel" as const) : ("informada_vendedor" as const),
    tarifa_gd_id: t.tarifa.id,
    distribuidora: t.tarifa.distribuidora,
    enquadramento: rotuloEnquadramento(enq.enquadramento),
    fio_b_rs_mwh: t.tarifa.fioBRsMwh,
    fio_b_base_tributaria: t.tarifa.baseTributaria,
    fio_b_vigencia_inicio: t.tarifa.vigenciaInicio,
    fio_b_vigencia_fim: t.tarifa.vigenciaFim,
  };
}

/**
 * Monta a linha de `calculos_solares` sem Supabase. `parametros` nulo = empresa sem parâmetros configurados;
 * `contexto` nulo = sem dados regulatórios (estimativa incompleta).
 * Tarifa (5 casas), potência, preço e fatura (2 casas) são normalizados por `valorComoPersistido` ANTES de `calcular`
 * e gravados já normalizados. O consumo (só o informado em kWh; conta em R$ sem kWh = estimativa incompleta) passa por
 * `consumoComoPersistido` e é gravado em `consumo_medio_kwh`. Potência ou tarifa que viram <= 0 após a normalização
 * devolvem erro (o banco exige > 0).
 */
export function linhaDeCalculo(
  empresaId: string,
  entrada: EntradaLinhaCalculo,
  parametros: ParametrosCalculo | null,
  contexto: ContextoEstimativa | null = null,
): ResultadoLinha {
  const problema = problemaDaEntrada(entrada);
  if (problema) return { ok: false, mensagem: problema };

  // Cada entrada persistida é normalizada para a escala da coluna ANTES de calcular; o valor normalizado é o
  // usado no cálculo e o gravado na linha (refazer dos dados salvos reproduz o resultado).
  const potenciaKwp = valorComoPersistido(entrada.potenciaKwp, CASAS_POTENCIA);
  if (!(potenciaKwp > 0)) return { ok: false, mensagem: MENSAGEM_POTENCIA };
  const tarifaKwh = valorComoPersistido(entrada.tarifaKwh, CASAS_TARIFA);
  if (!(tarifaKwh > 0)) return { ok: false, mensagem: MENSAGEM_TARIFA };
  const precoKit = valorComoPersistido(entrada.precoKit, CASAS_PRECO);
  if (!(precoKit >= 0)) return { ok: false, mensagem: MENSAGEM_PRECO };
  const valorFaturaMedio = entrada.valorFaturaMedio == null ? null : valorComoPersistido(entrada.valorFaturaMedio, CASAS_FATURA);
  const base = entrada.tarifaBaseTributaria ?? null;

  // Conta em R$ sem consumo em kWh: dividir pela tarifa BASE misturaria tarifa efetiva com tarifa base.
  // Não há tarifa efetiva confiável nesta entrada, então o cálculo financeiro não é gerado.
  if (entrada.consumoMedioKwh == null) {
    const pendencias = pendenciasDaEntrada({ consumoMedioKwh: null, valorFaturaMedio, tarifaKwh, tarifaBaseTributaria: base }, contexto);
    return {
      ok: false,
      mensagem: mensagemEstimativaIncompleta(pendencias),
      incompleta: true,
      pendencias,
      potenciaKwp,
      geracaoEstimadaKwhMes: parametros ? valorComoPersistido(potenciaKwp * parametros.produtividade_kwh_kwp_mes, 2) : null,
      linha: null,
    };
  }

  const consumoMedioKwh = consumoComoPersistido(entrada.consumoMedioKwh);
  if (!Number.isFinite(consumoMedioKwh) || consumoMedioKwh <= 0) return { ok: false, mensagem: MENSAGEM_CONSUMO };

  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  // Piso pela ligação (REN 1.000, art. 291), nunca pelo parâmetro da empresa.
  const disponibilidadeKwh = disponibilidadeArt291(entrada.tipoLigacao);
  if (disponibilidadeKwh == null) return { ok: false, mensagem: "Tipo de ligação inválido." };
  const resultado = calcular({
    potenciaKwp,
    precoKit,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh,
    produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
    dadosEstimativa: { contexto, tarifaBaseTributaria: base },
  });

  const comum = {
    empresa_id: empresaId,
    kit_id: null,
    kit_nome: entrada.kitNome,
    kit_potencia_kwp: potenciaKwp,
    kit_preco: precoKit,
    tipo_ligacao: entrada.tipoLigacao,
    consumo_medio_kwh: consumoMedioKwh,
    valor_fatura_medio: valorFaturaMedio,
    tarifa_kwh: tarifaKwh,
    produtividade_kwh_kwp_mes: parametros.produtividade_kwh_kwp_mes,
    // Coluna antiga (NOT NULL), sem efeito no motor: o percentual usado é `percentual_legal_fio_b`.
    percentual_fio_b: parametros.percentual_fio_b,
    disponibilidade_kwh: disponibilidadeKwh,
    geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
    financeiro_desatualizado_em: null,
    financeiro_desatualizado_motivo: null,
  } satisfies Partial<LinhaCalculo>;

  // Resultado técnico com as novas entradas, sem economia, conta, Fio B nem payback. Ausência nunca vira zero: o banco
  // exige esses campos nulos no estado `incompleto`.
  if (resultado.estado === "incompleta") {
    return {
      ok: false,
      mensagem: mensagemEstimativaIncompleta(resultado.pendencias),
      incompleta: true,
      pendencias: resultado.pendencias,
      potenciaKwp: resultado.potenciaKwp,
      geracaoEstimadaKwhMes: resultado.geracaoEstimadaKwhMes,
      linha: {
        ...comum,
        ...entradasRegistradas(contexto, tarifaKwh, base),
        estado_financeiro: "incompleto",
        metodo_calculo: null,
        pendencias: resultado.pendencias,
        kwh_faturado: null,
        kwh_compensado: null,
        kwh_nao_compensado: null,
        custo_fio_b: null,
        conta_sem_solar: null,
        conta_com_solar: null,
        economia_mensal: null,
        payback_meses: null,
        autoconsumo_kwh: null,
        ressalvas: null,
      },
    };
  }

  const r = resultado.retrato;
  return {
    ok: true,
    linha: {
      ...comum,
      estado_financeiro: "completo",
      metodo_calculo: r.metodo,
      pendencias: null,
      data_referencia: r.dataReferencia,
      tarifa_base_tributaria: r.tarifaBaseTributaria,
      tarifa_origem: r.tarifaOrigem,
      tarifa_gd_id: r.tarifaGdId,
      distribuidora: r.distribuidora,
      enquadramento: r.enquadramento,
      fio_b_rs_mwh: r.fioBRsMwh,
      fio_b_base_tributaria: r.fioBBaseTributaria,
      percentual_legal_fio_b: r.percentualLegalFioB,
      fio_b_vigencia_inicio: r.vigenciaInicio,
      fio_b_vigencia_fim: r.vigenciaFim,
      autoconsumo_kwh: r.autoconsumoKwh,
      ressalvas: r.ressalvas,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      kwh_nao_compensado: resultado.kwhNaoCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      // Payback indisponível no P0 (contrato, seção 4); o banco recusa outro valor no estado `completo`.
      payback_meses: null,
    },
  };
}

/** Campos da linha gravada que alimentam `calcular`. */
export type LinhaParaEntrada = Pick<
  LinhaCalculo,
  | "kit_potencia_kwp"
  | "kit_preco"
  | "tipo_ligacao"
  | "consumo_medio_kwh"
  | "tarifa_kwh"
  | "produtividade_kwh_kwp_mes"
  | "percentual_fio_b"
  | "disponibilidade_kwh"
>;

/** Reconstrói a entrada de `calcular` só com os valores GRAVADOS na linha (sem contexto regulatório). */
export function entradaDaLinha(linha: LinhaParaEntrada): EntradaCalculo {
  return {
    potenciaKwp: linha.kit_potencia_kwp,
    precoKit: linha.kit_preco,
    tipoLigacao: linha.tipo_ligacao as TipoLigacao,
    consumoMedioKwh: linha.consumo_medio_kwh,
    tarifaKwh: linha.tarifa_kwh,
    produtividadeKwhKwpMes: linha.produtividade_kwh_kwp_mes,
    percentualFioB: linha.percentual_fio_b,
    disponibilidadeKwh: linha.disponibilidade_kwh,
  };
}

/** Campos de uma linha `completo` necessários para refazer as contas sem consultar nada (retrato gravado). */
export type LinhaCompletaGravada = {
  kit_potencia_kwp: number;
  produtividade_kwh_kwp_mes: number;
  consumo_medio_kwh: number;
  tarifa_kwh: number;
  disponibilidade_kwh: number;
  fio_b_rs_mwh: number | null;
  percentual_legal_fio_b: number | null;
  autoconsumo_kwh: number | null;
};

/**
 * Refaz as contas de uma linha `completo` só com o retrato gravado (T, D, Fio B, percentual, consumo, potência,
 * produtividade). Serve para conferir que o que está no banco é reproduzível; nulo se faltar algum dado do retrato.
 */
export function recalcularDaLinha(l: LinhaCompletaGravada) {
  if (l.fio_b_rs_mwh == null || l.percentual_legal_fio_b == null) return null;
  const r = calcularFioBGd2({
    consumoTotalKwh: Number(l.consumo_medio_kwh),
    geracaoTotalKwh: Number(l.kit_potencia_kwp) * Number(l.produtividade_kwh_kwp_mes),
    autoconsumoInstantaneoKwh: Number(l.autoconsumo_kwh ?? 0),
    tarifaCheiaRsKwh: Number(l.tarifa_kwh),
    custoDisponibilidadeKwh: Number(l.disponibilidade_kwh),
    custoEnergiaCompensadaRsKwh: (Number(l.percentual_legal_fio_b) * Number(l.fio_b_rs_mwh)) / 1000,
  });
  return r.ok ? r : null;
}
