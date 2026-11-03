import { z } from "zod";
import { consumoComoPersistido } from "@/lib/consumo-persistido";
import { avaliarEstimativa, type Pendencia } from "@/lib/estimativa-financeira";
import { calcularFioBGd2, METODO_GD2_PISO_V1 } from "@/lib/fio-b-gd2";
import {
  disponibilidadeArt291,
  rotuloEnquadramento,
  tarifaOficialRsKwh,
  type BaseTributaria,
  type CodigoRessalva,
  type ContextoEstimativa,
} from "@/lib/tarifa-gd";
import { TIPOS_COMPONENTE_KIT, type TipoLigacao } from "@/lib/tipos";

export type EntradaCalculo = {
  potenciaKwp: number;
  precoKit: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  /** Tarifa base (TE + TUSD) usada como T, editável pelo vendedor; só completa com a base tributária declarada. */
  tarifaKwh: number;
  produtividadeKwhKwpMes: number;
  /** Sem efeito no motor (o percentual da empresa não é o percentual legal). Mantido por compatibilidade. */
  percentualFioB?: number;
  /** Sem efeito no motor (o piso vem da ligação, REN 1.000, art. 291). Mantido por compatibilidade. */
  disponibilidadeKwh?: number;
  /** Contexto regulatório do negócio (data, enquadramento, tarifa oficial) e base declarada da tarifa. Ausente = pendências. */
  dadosEstimativa?: { contexto: ContextoEstimativa | null; tarifaBaseTributaria: BaseTributaria | null };
};

/** O que o cálculo completo usou: gravado com a linha para reproduzir e auditar (contrato, seções 1, 2, 4 e 5). */
export type RetratoEstimativa = {
  metodo: typeof METODO_GD2_PISO_V1;
  dataReferencia: string;
  enquadramento: string;
  tarifaGdId: string;
  distribuidora: string;
  ato: string;
  tarifaOficialRsKwh: number;
  tarifaOrigem: "oficial_aneel" | "informada_vendedor";
  tarifaBaseTributaria: BaseTributaria;
  fioBRsMwh: number;
  fioBBaseTributaria: BaseTributaria;
  percentualLegalFioB: number;
  /** N = percentual × Fio B / 1000, sem arredondar (R$/kWh). */
  custoEnergiaCompensadaRsKwh: number;
  vigenciaInicio: string;
  vigenciaFim: string;
  disponibilidadeKwh: number;
  autoconsumoKwh: number;
  ressalvas: CodigoRessalva[];
};

/** Campos do resultado financeiro (ramo "completa"). Payback é sempre nulo no P0 (contrato, seção 4). */
export type CamposCalculoCompleto = {
  geracaoEstimadaKwhMes: number;
  kwhFaturado: number;
  kwhCompensado: number;
  kwhNaoCompensado: number;
  custoFioB: number;
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  paybackMeses: null;
};

/** Resultado do motor: `completa` só sem nenhuma pendência; dado ou regra pendente nunca vira número. */
export type ResultadoCalculo =
  | ({ estado: "completa"; retrato: RetratoEstimativa } & CamposCalculoCompleto)
  | { estado: "incompleta"; pendencias: Pendencia[]; potenciaKwp: number; geracaoEstimadaKwhMes: number };

export type ResultadoCalculoIncompleto = Extract<ResultadoCalculo, { estado: "incompleta" }>;
export type ResultadoCalculoCompleto = Extract<ResultadoCalculo, { estado: "completa" }>;

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Aritmética de arredondamento APROVADA pelo Evandro em 21/10/2026: a economia é a diferença entre as DUAS CONTAS JÁ
 * ARREDONDADAS em centavos (os números exibidos fecham: conta hoje − conta com sistema = economia). `calcularFioBGd2`
 * aplica a mesma regra; o payback daqui não é usado no P0 (indisponível).
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

/** Ressalvas fixas de todo resultado completo; as condicionais entram em `calcular`. */
const RESSALVAS_FIXAS: CodigoRessalva[] = ["autoconsumo_zero", "media_mensal", "modalidade_convencional", "gd2_sistema_novo", "sem_tributos"];

/**
 * Calculadora solar — modo comercial (motor).
 *
 * Sem pendências (enquadramento, tarifa oficial vigente, percentual legal do ano, consumo, tarifa e base tributária),
 * calcula pela regra aceita (`calcularFioBGd2`): T = tarifa informada; D pela ligação (art. 291); N = percentual legal
 * do ANO da data × TUSD Fio B da linha VIGENTE na data; C = consumo; E = geração (autoconsumo zero, declarado).
 * Precisão: G, N e as contas usam valores sem arredondar; só o resultado é arredondado (2 casas). Payback: nulo.
 * Com qualquer pendência devolve `incompleta` (geração e pendências, nunca conta, economia nem payback).
 */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const d = entrada.dadosEstimativa;
  const avaliacao = avaliarEstimativa({
    contexto: d?.contexto ?? null,
    tarifaBaseRsKwh: entrada.tarifaKwh,
    tarifaBaseBaseTributaria: d?.tarifaBaseTributaria ?? null,
    consumoMedioKwh: entrada.consumoMedioKwh,
    consumoOrigem: "informado",
    tarifaEfetivaContaRsKwh: null,
  });
  const geracaoKwh = entrada.potenciaKwp * entrada.produtividadeKwhKwpMes;
  const incompleta = (pendencias: Pendencia[]): ResultadoCalculo => ({
    estado: "incompleta",
    pendencias,
    potenciaKwp: entrada.potenciaKwp,
    geracaoEstimadaKwhMes: arredondar(geracaoKwh, 2),
  });
  const dados = avaliacao.dados;
  const D = disponibilidadeArt291(entrada.tipoLigacao);
  if (avaliacao.pendencias.length || !dados || D == null || !d?.tarifaBaseTributaria) return incompleta(avaliacao.pendencias);

  const N = (dados.percentualLegal * dados.tarifa.fioBRsMwh) / 1000;
  const r = calcularFioBGd2({
    consumoTotalKwh: entrada.consumoMedioKwh,
    geracaoTotalKwh: geracaoKwh,
    tarifaCheiaRsKwh: entrada.tarifaKwh,
    custoDisponibilidadeKwh: D,
    custoEnergiaCompensadaRsKwh: N,
  });
  // Entradas já validadas acima; aqui só sobra o que a fórmula recusa (ex.: T <= N).
  if (!r.ok) return incompleta([{ codigo: "tarifa_abaixo_do_fio_b", mensagem: r.motivo }]);

  const tarifaOficial = tarifaOficialRsKwh(dados.tarifa);
  const ressalvas: CodigoRessalva[] = [...RESSALVAS_FIXAS];
  if (entrada.tipoLigacao === "bifasico") ressalvas.push("bifasico_tres_condutores");
  if (r.energiaDisponivelNaoCompensadaKwh > 0) ressalvas.push("creditos_nao_valorados");
  if (dados.tarifa.pendenciasFonte.includes("tabela4_nao_conferida")) ressalvas.push("tabela4_nao_conferida");
  ressalvas.push("payback_indisponivel");

  return {
    estado: "completa",
    geracaoEstimadaKwhMes: arredondar(geracaoKwh, 2),
    kwhFaturado: r.energiaFaturadaTarifaCheiaKwh,
    kwhCompensado: r.energiaCompensadaKwh,
    kwhNaoCompensado: r.energiaDisponivelNaoCompensadaKwh,
    custoFioB: r.custoEnergiaCompensada,
    contaSemSolar: r.contaSemSolar,
    contaComSolar: r.contaComSolar,
    economiaMensal: r.economiaMensal,
    paybackMeses: null,
    retrato: {
      metodo: r.metodo,
      dataReferencia: dados.dataReferencia,
      enquadramento: rotuloEnquadramento(dados.enquadramento),
      tarifaGdId: dados.tarifa.id,
      distribuidora: dados.tarifa.distribuidora,
      ato: dados.tarifa.ato,
      tarifaOficialRsKwh: tarifaOficial,
      tarifaOrigem: arredondar(entrada.tarifaKwh, 5) === tarifaOficial ? "oficial_aneel" : "informada_vendedor",
      tarifaBaseTributaria: d.tarifaBaseTributaria,
      fioBRsMwh: dados.tarifa.fioBRsMwh,
      fioBBaseTributaria: dados.tarifa.baseTributaria,
      percentualLegalFioB: dados.percentualLegal,
      custoEnergiaCompensadaRsKwh: N,
      vigenciaInicio: dados.tarifa.vigenciaInicio,
      vigenciaFim: dados.tarifa.vigenciaFim,
      disponibilidadeKwh: D,
      autoconsumoKwh: 0,
      ressalvas,
    },
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
