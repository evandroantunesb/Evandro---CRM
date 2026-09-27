import { z } from "zod";
import { TIPOS_COMPONENTE_KIT, type TipoLigacao } from "@/lib/tipos";

export type EntradaCalculo = {
  potenciaKwp: number;
  precoKit: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  tarifaKwh: number;
  produtividadeKwhKwpMes: number;
  percentualFioB: number;
  disponibilidadeKwh: number;
};

export type ResultadoCalculo = {
  geracaoEstimadaKwhMes: number;
  kwhFaturado: number;
  kwhCompensado: number;
  custoFioB: number;
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  /** Nulo quando o sistema não gera economia (kit pequeno demais ou tarifa muito baixa). */
  paybackMeses: number | null;
};

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Calculadora solar — modo comercial.
 *
 * Estimativa simplificada (sem simulação horária/pvlib): usa uma produtividade
 * média (kWh por kWp por mês) e desconta da conta o custo de disponibilidade
 * mínimo e o Fio B (Lei 14.300) sobre a energia compensada. Não considera
 * banco de créditos entre meses nem sazonalidade — o vendedor deve tratar o
 * resultado como uma estimativa comercial, não um projeto de engenharia.
 */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const { potenciaKwp, consumoMedioKwh, tarifaKwh, produtividadeKwhKwpMes, percentualFioB, disponibilidadeKwh } =
    entrada;

  const geracaoEstimadaKwhMes = potenciaKwp * produtividadeKwhKwpMes;

  // A concessionária sempre cobra pelo menos o custo de disponibilidade (em
  // kWh), mesmo quando a geração cobre todo o consumo.
  let kwhFaturado = Math.max(consumoMedioKwh - geracaoEstimadaKwhMes, disponibilidadeKwh);
  kwhFaturado = Math.min(kwhFaturado, consumoMedioKwh);
  const kwhCompensado = Math.max(consumoMedioKwh - kwhFaturado, 0);

  const custoFioB = kwhCompensado * tarifaKwh * percentualFioB;
  const contaSemSolar = consumoMedioKwh * tarifaKwh;
  const contaComSolar = kwhFaturado * tarifaKwh + custoFioB;
  const economiaMensal = contaSemSolar - contaComSolar;

  return {
    geracaoEstimadaKwhMes: arredondar(geracaoEstimadaKwhMes, 2),
    kwhFaturado: arredondar(kwhFaturado, 2),
    kwhCompensado: arredondar(kwhCompensado, 2),
    custoFioB: arredondar(custoFioB, 2),
    contaSemSolar: arredondar(contaSemSolar, 2),
    contaComSolar: arredondar(contaComSolar, 2),
    economiaMensal: arredondar(economiaMensal, 2),
    paybackMeses: economiaMensal > 0 ? arredondar(entrada.precoKit / economiaMensal, 1) : null,
  };
}

export const DISPONIBILIDADE_PADRAO: Record<TipoLigacao, "disponibilidade_mono_kwh" | "disponibilidade_bi_kwh" | "disponibilidade_tri_kwh"> = {
  monofasico: "disponibilidade_mono_kwh",
  bifasico: "disponibilidade_bi_kwh",
  trifasico: "disponibilidade_tri_kwh",
};

/** Mesma coisa que DISPONIBILIDADE_PADRAO, para os parâmetros já carregados em camelCase no cliente. */
export const DISPONIBILIDADE_PADRAO_CAMEL: Record<
  TipoLigacao,
  "disponibilidadeMonoKwh" | "disponibilidadeBiKwh" | "disponibilidadeTriKwh"
> = {
  monofasico: "disponibilidadeMonoKwh",
  bifasico: "disponibilidadeBiKwh",
  trifasico: "disponibilidadeTriKwh",
};

/**
 * Potência total do kit personalizado: soma da potência dos módulos
 * (os únicos componentes com potência elétrica relevante para o cálculo).
 * Inversor, bateria e outros itens são só especificação técnica.
 */
export function potenciaKitPersonalizadoKwp(
  componentes: { tipo: string; potenciaW: number | null; quantidade: number }[],
): number {
  const totalWp = componentes
    .filter((c) => c.tipo === "modulo" && c.potenciaW)
    .reduce((soma, c) => soma + c.potenciaW! * c.quantidade, 0);
  return Math.round((totalWp / 1000) * 100) / 100;
}

/** Um item do kit personalizado (módulo, inversor, bateria ou outro). */
export const componenteKitSchema = z.object({
  tipo: z.enum(TIPOS_COMPONENTE_KIT),
  descricao: z.string().trim().min(1, "Descreva o componente").max(120, "Descrição muito longa"),
  potenciaW: z.number().positive().nullable(),
  quantidade: z.number().int().positive(),
});
export type ComponenteKit = z.infer<typeof componenteKitSchema>;

/** Os componentes vêm do formulário como JSON (lista dinâmica de tamanho variável). */
export const componentesJsonSchema = z
  .string()
  .default("[]")
  .transform((v, ctx) => {
    try {
      const bruto = JSON.parse(v);
      const r = z.array(componenteKitSchema).max(50, "No máximo 50 componentes").safeParse(bruto);
      if (!r.success) {
        ctx.addIssue({ code: "custom", message: "Componentes do kit inválidos" });
        return z.NEVER;
      }
      return r.data;
    } catch {
      ctx.addIssue({ code: "custom", message: "Componentes do kit inválidos" });
      return z.NEVER;
    }
  });

/**
 * Sugere quantos módulos de uma dada potência cobririam o consumo informado
 * (100% de compensação, modo comercial). Sugestão de partida pro vendedor —
 * não considera Fio B/disponibilidade nem espaço de telhado.
 */
export function sugerirQuantidadeModulos(
  consumoMedioKwh: number,
  produtividadeKwhKwpMes: number,
  potenciaModuloW: number,
): number | null {
  if (consumoMedioKwh <= 0 || produtividadeKwhKwpMes <= 0 || potenciaModuloW <= 0) return null;
  const potenciaNecessariaKwp = consumoMedioKwh / produtividadeKwhKwpMes;
  return Math.max(1, Math.ceil((potenciaNecessariaKwp * 1000) / potenciaModuloW));
}

export type ParametrosCustosInternos = {
  custoInstalacaoPorModulo: number;
  custoMaterialCaPorKwp: number;
  custoEngenharia: number;
  comissaoPercentual: number;
};

export type CustosInternosEstimados = {
  custoInstalacao: number;
  custoMaterialCa: number;
  custoEngenharia: number;
  comissao: number;
  total: number;
};

/**
 * Soma os custos internos configuráveis (material CA, instalação por módulo,
 * engenharia, comissão) ao preço já estimado dos componentes, pra sugerir um
 * ponto de partida de preço final — o vendedor continua livre pra editar.
 * Comissão incide sobre componentes + instalação + material CA + engenharia.
 */
export function custosInternosEstimados(
  precoComponentesBRL: number,
  quantidadeModulos: number,
  potenciaKwp: number,
  parametros: ParametrosCustosInternos,
): CustosInternosEstimados {
  const custoInstalacao = arredondar(parametros.custoInstalacaoPorModulo * quantidadeModulos, 2);
  const custoMaterialCa = arredondar(parametros.custoMaterialCaPorKwp * potenciaKwp, 2);
  const custoEngenharia = arredondar(parametros.custoEngenharia, 2);
  const subtotal = precoComponentesBRL + custoInstalacao + custoMaterialCa + custoEngenharia;
  const comissao = arredondar(subtotal * parametros.comissaoPercentual, 2);
  return {
    custoInstalacao,
    custoMaterialCa,
    custoEngenharia,
    comissao,
    total: arredondar(subtotal + comissao, 2),
  };
}

/** Nome de exibição do kit a partir dos componentes escolhidos. */
export function nomeKitPersonalizado(componentes: ComponenteKit[]): string {
  const modulo = componentes.find((c) => c.tipo === "modulo");
  if (!modulo) return "Kit personalizado";
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);
  return `Kit personalizado · ${potenciaKwp.toLocaleString("pt-BR")} kWp (${modulo.descricao})`;
}
