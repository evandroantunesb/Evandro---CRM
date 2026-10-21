/**
 * Cálculo solar reproduzível a partir do que fica gravado (funções puras, sem Supabase e sem "server-only").
 *
 * As entradas usadas em `calcular` (consumo, tarifa, potência, preço, fatura) são as MESMAS que serão persistidas
 * em `calculos_solares`, na escala das colunas. Assim, refazer o cálculo a partir da linha salva reproduz os resultados salvos.
 * As fórmulas de `calcular` não são tocadas aqui.
 */
import { calcular, DISPONIBILIDADE_PADRAO, type EntradaCalculo } from "@/lib/calculadora";
import { consumoComoPersistido, valorComoPersistido } from "@/lib/consumo-persistido";
import type { Database } from "@/lib/supabase/database.types";
import type { TipoLigacao } from "@/lib/tipos";

export type LinhaCalculo = Omit<
  Database["public"]["Tables"]["calculos_solares"]["Insert"],
  "negocio_id" | "observacoes" | "atualizado_por" | "criado_por"
>;

// Contrato anterior preservado: a implementação mora em `consumo-persistido` (sem dependências).
export { consumoComoPersistido, valorComoPersistido };

/** Escalas de `calculos_solares` (migration 20260926000100_calculadora.sql). */
const CASAS_TARIFA = 4; // tarifa_kwh numeric(8,4)
const CASAS_POTENCIA = 2; // kit_potencia_kwp numeric(6,2)
const CASAS_PRECO = 2; // kit_preco numeric(12,2)
const CASAS_FATURA = 2; // valor_fatura_medio numeric(12,2)

const MENSAGEM_POTENCIA = "Informe ao menos um módulo com potência para calcular.";
const MENSAGEM_TARIFA = "Informe uma tarifa maior que zero (o banco guarda 4 casas).";
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
};

/** Campos de `parametros_calculadora` usados no cálculo. */
export type ParametrosCalculo = {
  produtividade_kwh_kwp_mes: number;
  percentual_fio_b: number;
  disponibilidade_mono_kwh: number;
  disponibilidade_bi_kwh: number;
  disponibilidade_tri_kwh: number;
};

export type ResultadoLinha = { ok: true; linha: LinhaCalculo } | { ok: false; mensagem: string };

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
 * Monta a linha de `calculos_solares` sem Supabase. `parametros` nulo = empresa sem parâmetros configurados.
 * Tarifa (4 casas), potência, preço e fatura (2 casas) são normalizados por `valorComoPersistido` ANTES de `calcular`
 * e gravados já normalizados. O consumo (informado, ou fatura persistida ÷ tarifa persistida) passa por
 * `consumoComoPersistido` e é gravado em `consumo_medio_kwh`. Potência ou tarifa que viram <= 0 após a normalização
 * devolvem erro (o banco exige > 0).
 */
export function linhaDeCalculo(empresaId: string, entrada: EntradaLinhaCalculo, parametros: ParametrosCalculo | null): ResultadoLinha {
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

  const consumoMedioKwh = consumoComoPersistido(entrada.consumoMedioKwh ?? valorFaturaMedio! / tarifaKwh);
  if (!Number.isFinite(consumoMedioKwh) || consumoMedioKwh <= 0) return { ok: false, mensagem: MENSAGEM_CONSUMO };

  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]];
  const resultado = calcular({
    potenciaKwp,
    precoKit,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh,
    produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  return {
    ok: true,
    linha: {
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
      percentual_fio_b: parametros.percentual_fio_b,
      disponibilidade_kwh: disponibilidadeKwh,
      geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      // Sem preço do kit (negócio sem valor definido), o payback não tem
      // significado — fica em aberto em vez de mostrar "0 meses".
      payback_meses: precoKit > 0 ? resultado.paybackMeses : null,
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

/** Reconstrói a entrada de `calcular` só com os valores GRAVADOS na linha. */
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
