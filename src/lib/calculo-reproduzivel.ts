/**
 * Cálculo solar reproduzível a partir do que fica gravado (funções puras, sem Supabase e sem "server-only").
 *
 * O consumo usado em `calcular` é o MESMO que será persistido em `calculos_solares.consumo_medio_kwh`
 * (numeric(10,2)). Assim, refazer o cálculo a partir da linha salva reproduz os resultados salvos.
 * As fórmulas de `calcular` não são tocadas aqui.
 */
import { calcular, DISPONIBILIDADE_PADRAO, type EntradaCalculo } from "@/lib/calculadora";
import type { Database } from "@/lib/supabase/database.types";
import type { TipoLigacao } from "@/lib/tipos";

export type LinhaCalculo = Omit<
  Database["public"]["Tables"]["calculos_solares"]["Insert"],
  "negocio_id" | "observacoes" | "atualizado_por" | "criado_por"
>;

/** Escala de `calculos_solares.consumo_medio_kwh` (e de `negocios.consumo_medio_kwh`): numeric(10, 2). */
const CASAS_CONSUMO = 2;

/**
 * Consumo como o Postgres o gravará em numeric(10,2): 2 casas, arredondamento half away from zero sobre o valor
 * DECIMAL do número (a representação mais curta que identifica o double, que é o texto enviado ao banco).
 * Não usa `Math.round(x * 100)`: 1.005 * 100 = 100.49999999999999, mas o banco grava 1,01 para 1.005.
 *
 * Idempotente. Entrada não finita (NaN, ±Infinity) é devolvida como veio, sem mascarar: a validação/erro
 * continua a cargo de quem chama (hoje, o próprio banco rejeita). Não valida o limite de 10 dígitos da coluna.
 */
export function consumoComoPersistido(kwh: number): number {
  if (!Number.isFinite(kwh)) return kwh;
  const negativo = kwh < 0;
  let texto = Math.abs(kwh).toString();
  if (/e/i.test(texto)) {
    // Notação científica: valores < 1e-6 ou >= 1e21. Expande em decimal fixo (o excedente de casas é arredondado abaixo).
    if (Math.abs(kwh) >= 1) return kwh; // inteiro grande: já não tem casas fracionárias
    texto = Math.abs(kwh).toFixed(20);
  }
  const [inteiro, fracao = ""] = texto.split(".");
  if (fracao.length <= CASAS_CONSUMO) return kwh;
  const mantida = fracao.slice(0, CASAS_CONSUMO);
  const sobe = fracao.charCodeAt(CASAS_CONSUMO) >= 53; // dígito seguinte >= '5' => afasta de zero
  // Centésimos como inteiro exato (a coluna tem 10 dígitos, muito abaixo de 2^53).
  const centesimos = Number(inteiro + mantida) + (sobe ? 1 : 0);
  const valor = Number(centesimos) / 10 ** CASAS_CONSUMO;
  return negativo && valor !== 0 ? -valor : valor;
}

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
    return "Informe ao menos um módulo com potência para calcular.";
  }
  return null;
}

/**
 * Monta a linha de `calculos_solares` sem Supabase. `parametros` nulo = empresa sem parâmetros configurados.
 * O consumo (informado, ou fatura ÷ tarifa) é normalizado por `consumoComoPersistido` ANTES de `calcular`, e esse
 * mesmo valor é gravado em `consumo_medio_kwh`.
 */
export function linhaDeCalculo(empresaId: string, entrada: EntradaLinhaCalculo, parametros: ParametrosCalculo | null): ResultadoLinha {
  const problema = problemaDaEntrada(entrada);
  if (problema) return { ok: false, mensagem: problema };
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const consumoMedioKwh = consumoComoPersistido(entrada.consumoMedioKwh ?? entrada.valorFaturaMedio! / entrada.tarifaKwh);
  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]];
  const resultado = calcular({
    potenciaKwp: entrada.potenciaKwp,
    precoKit: entrada.precoKit,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: entrada.tarifaKwh,
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
      kit_potencia_kwp: entrada.potenciaKwp,
      kit_preco: entrada.precoKit,
      tipo_ligacao: entrada.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: entrada.valorFaturaMedio,
      tarifa_kwh: entrada.tarifaKwh,
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
      payback_meses: entrada.precoKit > 0 ? resultado.paybackMeses : null,
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
