import { z } from "zod";
import { consumoComoPersistido } from "@/lib/consumo-persistido";
import { avaliarEstimativa, ENQUADRAMENTO_NAO_INFORMADO, hojeIso, type EntradaEstimativa, type Pendencia } from "@/lib/estimativa-financeira";
import { TIPOS_COMPONENTE_KIT, type TipoLigacao } from "@/lib/tipos";

export type EntradaCalculo = {
  potenciaKwp: number;
  precoKit: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  /** Tarifa informada pelo vendedor. Não tem base tributária declarada: sozinha não completa a estimativa. */
  tarifaKwh: number;
  produtividadeKwhKwpMes: number;
  /** Sem efeito no motor atual (o percentual da empresa não é o percentual legal). Mantido por compatibilidade. */
  percentualFioB?: number;
  /** Sem efeito no motor atual (só entrará com a regra validada). Mantido por compatibilidade. */
  disponibilidadeKwh?: number;
  /**
   * Dados da estimativa que hoje não existem em lugar nenhum do app (enquadramento, Fio B da distribuidora com
   * origem e vigência, base tributária). Ausentes = pendências.
   */
  dadosEstimativa?: Partial<
    Pick<EntradaEstimativa, "enquadramento" | "tarifaBaseBaseTributaria" | "parametrosFioB" | "tarifaEfetivaContaRsKwh" | "dataReferencia">
  >;
};

/** Campos do resultado financeiro. Só existem no ramo "completa", que hoje não é produzido. */
export type CamposCalculoCompleto = {
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

/**
 * Resultado do motor. `incompleta` é o ÚNICO estado produzido hoje: regra ou dado pendente nunca vira número.
 * `completa` é só ponto de extensão (a fórmula entra depois da validação do Evandro) e usa `fecharEconomia`.
 */
export type ResultadoCalculo =
  | ({ estado: "completa" } & CamposCalculoCompleto)
  | { estado: "incompleta"; pendencias: Pendencia[]; potenciaKwp: number; geracaoEstimadaKwhMes: number };

export type ResultadoCalculoIncompleto = Extract<ResultadoCalculo, { estado: "incompleta" }>;

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Aritmética de arredondamento APROVADA pelo Evandro em 21/10/2026 (só ela; a fórmula das contas NÃO está aprovada):
 * a economia é a diferença entre as DUAS CONTAS JÁ ARREDONDADAS em centavos (os números exibidos fecham: conta hoje −
 * conta com sistema = economia). Economia <= 0 => payback indisponível (null); o payback usa a economia arredondada.
 * Pronta para o ramo "completa"; NENHUM caminho de produção a chama hoje.
 * Ver .aurora/contratos/m2-p0-arredondamento-economia.md.
 */
export function fecharEconomia(
  contaSemSolar: number,
  contaComSolar: number,
  precoKit: number,
): { contaSemSolar: number; contaComSolar: number; economiaMensal: number; paybackMeses: number | null } {
  const contaSemSolarArred = arredondar(contaSemSolar, 2);
  const contaComSolarArred = arredondar(contaComSolar, 2);
  const economiaMensal = arredondar(contaSemSolarArred - contaComSolarArred, 2);
  return {
    contaSemSolar: contaSemSolarArred,
    contaComSolar: contaComSolarArred,
    economiaMensal,
    paybackMeses: economiaMensal > 0 ? arredondar(precoKit / economiaMensal, 1) : null,
  };
}

/**
 * Calculadora solar — modo comercial (motor).
 *
 * A cobrança financeira antiga (sem piso; Fio B = kWh compensado × tarifa cheia × percentual) foi RETIRADA do
 * caminho de produção: nunca foi validada. Regra ou dado pendente = estimativa incompleta, sem recorrer a ela.
 * O motor devolve a geração (potência × produtividade) e as pendências, nunca conta, economia nem payback.
 * A fórmula validada entrará no ramo `completa` (ponto de extensão), reaproveitando `fecharEconomia`.
 * Ver .aurora/contratos/m2-p0-motor-estimativa.md.
 */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const d = entrada.dadosEstimativa ?? {};
  const estimativa = avaliarEstimativa({
    enquadramento: d.enquadramento ?? ENQUADRAMENTO_NAO_INFORMADO,
    tarifaBaseRsKwh: entrada.tarifaKwh,
    tarifaBaseBaseTributaria: d.tarifaBaseBaseTributaria ?? null,
    consumoMedioKwh: entrada.consumoMedioKwh,
    consumoOrigem: "informado",
    tarifaEfetivaContaRsKwh: d.tarifaEfetivaContaRsKwh ?? null,
    parametrosFioB: d.parametrosFioB ?? null,
    dataReferencia: d.dataReferencia ?? hojeIso(),
    potenciaKwp: entrada.potenciaKwp,
    produtividadeKwhKwpMes: entrada.produtividadeKwhKwpMes,
  });
  return {
    estado: "incompleta",
    pendencias: estimativa.pendencias,
    potenciaKwp: entrada.potenciaKwp,
    geracaoEstimadaKwhMes: arredondar(entrada.potenciaKwp * entrada.produtividadeKwhKwpMes, 2),
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

/** Módulo de referência da prévia do assistente de novo negócio, enquanto o vendedor não escolheu um. */
export const POTENCIA_MODULO_REFERENCIA_W = 620;

export type Dimensionamento = {
  /** Potência que cobre 100% do consumo médio com a produtividade da empresa. */
  potenciaNecessariaKwp: number;
  quantidadeModulos: number;
  /** Potência efetivamente instalada: módulos × potência do módulo. */
  potenciaInstaladaKwp: number;
};

/**
 * Fonte única do dimensionamento (assistente de novo negócio e kit personalizado).
 * Cobre 100% do consumo médio com a produtividade configurada da empresa (kWh/kWp/mês) e
 * arredonda os módulos para cima. Sem fator oculto: perdas e sazonalidade já estão na
 * produtividade. Estimativa comercial de partida — não considera Fio B, disponibilidade nem
 * espaço de telhado.
 *
 * O consumo é normalizado com `consumoComoPersistido` (numeric(10,2), como o banco grava) antes da conta,
 * para que o dimensionamento use o mesmo consumo que será salvo (ex.: 1190,404 → 1190,40). Entrada inválida
 * (não positiva, não finita, ou que vira 0 após a normalização) devolve null.
 */
export function dimensionarSistema(
  consumoBrutoKwh: number,
  produtividadeKwhKwpMes: number,
  potenciaModuloW: number,
): Dimensionamento | null {
  const consumoMedioKwh = consumoComoPersistido(consumoBrutoKwh);
  if (
    !(consumoMedioKwh > 0) ||
    !(produtividadeKwhKwpMes > 0) ||
    !(potenciaModuloW > 0) ||
    !Number.isFinite(consumoMedioKwh) ||
    !Number.isFinite(produtividadeKwhKwpMes) ||
    !Number.isFinite(potenciaModuloW)
  ) {
    return null;
  }
  const potenciaNecessariaKwp = consumoMedioKwh / produtividadeKwhKwpMes;
  // O arredondamento a 6 casas evita que 20,000000000000004 vire 21 módulos.
  const modulosExatos = Number(((potenciaNecessariaKwp * 1000) / potenciaModuloW).toFixed(6));
  const quantidadeModulos = Math.max(1, Math.ceil(modulosExatos));
  return {
    potenciaNecessariaKwp: arredondar(potenciaNecessariaKwp, 2),
    quantidadeModulos,
    potenciaInstaladaKwp: arredondar((quantidadeModulos * potenciaModuloW) / 1000, 2),
  };
}

/** Quantos módulos de uma dada potência cobrem o consumo informado (mesma conta de `dimensionarSistema`). */
export function sugerirQuantidadeModulos(
  consumoMedioKwh: number,
  produtividadeKwhKwpMes: number,
  potenciaModuloW: number,
): number | null {
  return dimensionarSistema(consumoMedioKwh, produtividadeKwhKwpMes, potenciaModuloW)?.quantidadeModulos ?? null;
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
