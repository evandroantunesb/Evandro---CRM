/**
 * Vigência do cálculo solar salvo (`calculos_solares`) frente ao estado atual do negócio.
 *
 * Regra (Evandro, M2-B6/B7): comparam-se SOMENTE as entradas que têm fonte independente. O que não tem fonte
 * (tarifa digitada, tipo de ligação) NÃO é comparado: fica registrado em `naoVerificavel`, separado de `vigente`, e
 * nunca vira "atual". O cálculo nunca é comparado consigo mesmo.
 *
 * Estados (`estado_financeiro`): `legado` (fórmula antiga, não validada) e `incompleto` (sem parte financeira) nunca
 * valem como atuais. `completo` (regra aceita) vale enquanto nenhum motivo abaixo aparecer.
 *
 * Guardas por ação (`motivosDaAcao`): proposta e preço recusam com qualquer motivo; o contrato considera só o que afeta
 * o contrato (kit, preço, produtividade, consumo) e ignora os motivos só financeiros.
 *
 * O que é comparado (e contra qual fonte atual):
 *  - kit: potência (2 casas) E composição. Kit personalizado (`kit_id` nulo): `nomeKitPersonalizado(itens atuais)`
 *    === `kit_nome`. Kit de catálogo (`kit_id` preenchido): nome e potência do registro de `kits_solares`.
 *  - investimento: `kit_preco` x `negocios.valor` (`precoDoCalculoDesatualizado`).
 *  - parâmetros da empresa: `produtividade_kwh_kwp_mes` x `parametros_calculadora`. Linha legada: também
 *    `percentual_fio_b` e `disponibilidade_kwh` da empresa (como antes). Linha nova: `disponibilidade_kwh` x piso do
 *    art. 291 pela ligação (o percentual da empresa não entra no cálculo).
 *  - consumo/fatura: `consumo_medio_kwh` e `valor_fatura_medio` x `negocios.consumo_medio_kwh` e
 *    `negocios.valor_conta_energia`.
 *  - regra tarifária (só `completo`): enquadramento pela qualificação de HOJE, linha oficial vigente HOJE e percentual
 *    legal do ANO de hoje x o retrato gravado. Virada de ano (60% → 75%) ou fim da vigência = `regra_tarifaria`.
 *  - marca R6.2 (`financeiro_desatualizado_em`): `desatualizado_por_entradas`.
 */
import { potenciaKitPersonalizadoKwp, nomeKitPersonalizado, DISPONIBILIDADE_PADRAO, type ComponenteKit } from "@/lib/calculadora";
import { precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { valorComoPersistido } from "@/lib/consumo-persistido";
import { carregarContextoEstimativa } from "@/lib/contexto-estimativa";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  disponibilidadeArt291,
  enquadramentoDoTipoCliente,
  percentualLegalFioB,
  resolverTarifa,
  rotuloEnquadramento,
  type ContextoEstimativa,
} from "@/lib/tarifa-gd";

export const MENSAGEM_CALCULO_DESATUALIZADO =
  "Último cálculo — desatualizado: o kit mudou depois dele. Complete os dados para recalcular.";

export const MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO =
  "O kit mudou depois do último cálculo. Complete os dados e recalcule antes de gerar a proposta.";

export const MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO = "O kit mudou depois do último cálculo. Recalcule antes de gerar o contrato.";

export const MENSAGEM_PRECO_CALCULO_DESATUALIZADO = "O kit mudou depois do último cálculo: recalcule o kit antes de atualizar o preço.";

export const MENSAGEM_PRECO_CALCULO_LEGADO =
  "O cálculo salvo foi feito pela fórmula antiga, que não foi validada: o preço não pode ser atualizado nele. Recalcule o kit.";

export const MENSAGEM_PRECO_CALCULO_INCOMPLETO =
  "A estimativa financeira está incompleta: não há economia calculada para acompanhar o preço. Complete os dados e recalcule o kit.";

/**
 * Cálculo completo e vigente: mesmo assim o link da proposta antiga (com conta e economia) não é gerado neste P0 (a
 * proposta com economia, D1/D2, está congelada). A proposta simples (sem economia) segue pela emissão.
 */
export const MENSAGEM_PROPOSTA_ECONOMIA_INDISPONIVEL =
  "A proposta com conta e economia ainda não está liberada. Emita a proposta simples (sistema, geração e preço, sem economia).";

export const MENSAGEM_PROPOSTA_CALCULO_INCOMPLETO =
  "A estimativa financeira do último cálculo está incompleta: complete os dados indicados no kit e recalcule antes de gerar a proposta.";

/** Por que o cálculo salvo não vale como atual. */
export type MotivoDesatualizacao =
  | "legado" // linha gerada pela fórmula antiga (não validada): `estado_financeiro = 'legado'`
  | "incompleta" // resultado técnico sem parte financeira: `estado_financeiro = 'incompleto'`
  | "desatualizado_por_entradas" // R6.2: entradas mudaram sem resultado novo (`financeiro_desatualizado_em`)
  | "kit"
  | "consumo"
  | "parametros" // produtividade (afeta a geração, logo o contrato)
  | "regra_tarifaria" // tarifa oficial vigente, percentual legal do ano ou enquadramento mudaram (só `completo`)
  | "parametros_financeiros" // linha legada: percentual do Fio B e disponibilidade da empresa; nova: piso do art. 291
  | "preco"
  | "nao_comprovado";

/** Ordem de relevância: o primeiro motivo da lista é o "principal" citado nas mensagens. */
const PRIORIDADE: MotivoDesatualizacao[] = [
  "legado",
  "incompleta",
  "desatualizado_por_entradas",
  "kit",
  "consumo",
  "parametros",
  "regra_tarifaria",
  "parametros_financeiros",
  "preco",
  "nao_comprovado",
];

/** Motivos que só afetam a parte financeira (o contrato os ignora). */
const SO_FINANCEIROS: readonly MotivoDesatualizacao[] = [
  "legado",
  "incompleta",
  "desatualizado_por_entradas",
  "regra_tarifaria",
  "parametros_financeiros",
];

/** Entradas do cálculo SEM fonte independente atual: registradas, nunca comparadas nem rotuladas como atuais. */
export type EntradaNaoVerificavel = "tarifa" | "tipo_ligacao" | "fio_b" | "enquadramento";

export const ENTRADAS_NAO_VERIFICAVEIS: readonly EntradaNaoVerificavel[] = ["tarifa", "tipo_ligacao", "fio_b", "enquadramento"];

/** Na linha `completo`, Fio B e enquadramento são conferidos contra a referência oficial e a qualificação de hoje. */
const NAO_VERIFICAVEIS_COMPLETO: readonly EntradaNaoVerificavel[] = ["tarifa", "tipo_ligacao"];

/** `vigente` só reflete as entradas verificáveis; `naoVerificavel` é a lista do que não foi (nem pode ser) conferido. */
export type Vigencia = { vigente: boolean; motivos: MotivoDesatualizacao[]; naoVerificavel: EntradaNaoVerificavel[] };

/**
 * Verdadeiro para a linha gerada pela fórmula antiga (`estado_financeiro = 'legado'`, default de toda linha anterior à
 * migration 20261023200000). Estado ausente (recorte de colunas sem ele) também conta como legado: nunca vale como atual.
 */
export function calculoEhLegado(calculo?: { estado_financeiro?: string | null } | null): boolean {
  const estado = calculo?.estado_financeiro;
  return estado == null || estado === "legado";
}

/** Verdadeiro para o resultado técnico gravado sem parte financeira (`estado_financeiro = 'incompleto'`). */
export function calculoEhIncompleto(calculo?: { estado_financeiro?: string | null } | null): boolean {
  return calculo?.estado_financeiro === "incompleto";
}

/** Linha de `kit_componentes` (só o que a soma de potência usa). */
export type ComponenteKitVigencia = { tipo: string; potencia_w: number | null; quantidade: number };

/** Linha completa de `kit_componentes` necessária para comparar a composição (nome do kit). */
export type ComponenteKitAtual = ComponenteKitVigencia & { descricao: string; ordem: number };

/** Colunas de `calculos_solares` usadas na comparação. */
export type CalculoParaVigencia = {
  kit_id: string | null;
  kit_nome: string;
  kit_potencia_kwp: number;
  kit_preco: number;
  tipo_ligacao: string;
  consumo_medio_kwh: number;
  valor_fatura_medio: number | null;
  percentual_fio_b: number;
  produtividade_kwh_kwp_mes: number;
  disponibilidade_kwh: number;
  /** Ausente = legado (ver `calculoEhLegado`). */
  estado_financeiro?: string | null;
  /** R6.2 (ausente = sem marca). */
  financeiro_desatualizado_em?: string | null;
  /** Retrato da linha `completo` (ausente = não comprovado). */
  enquadramento?: string | null;
  tarifa_gd_id?: string | null;
  percentual_legal_fio_b?: number | null;
};

export type ParametrosAtuais = {
  produtividade_kwh_kwp_mes: number;
  percentual_fio_b: number;
  disponibilidade_mono_kwh: number;
  disponibilidade_bi_kwh: number;
  disponibilidade_tri_kwh: number;
};

export type EstadoAtualParaVigencia = {
  /** Itens atuais do kit do negócio (`kit_componentes`). */
  componentes: ComponenteKitAtual[];
  /** Registro de `kits_solares` do `kit_id` do cálculo (só quando há `kit_id`); ausente = não comprovado. */
  kitCatalogo?: { id: string; nome: string; potencia_kwp: number } | null;
  /** `negocios.valor`. */
  valorNegocio: number | null;
  /** `negocios.consumo_medio_kwh`. */
  consumoMedioKwhNegocio: number | null;
  /** `negocios.valor_conta_energia`. */
  valorContaEnergiaNegocio: number | null;
  /** `parametros_calculadora` atual da empresa; nulo = não lido/inexistente (não comprovado). */
  parametros: ParametrosAtuais | null;
  /** Contexto regulatório de HOJE (data, qualificação, tarifas oficiais); só usado na linha `completo`. */
  contexto?: ContextoEstimativa | null;
};

/**
 * Potência do kit em kWp, como o cálculo a grava: só módulos (quantidade x potência_w / 1000), 2 casas.
 * Reaproveita `potenciaKitPersonalizadoKwp`, a mesma função que alimenta `kit_potencia_kwp`.
 */
export function potenciaDoKitKwp(componentes: ComponenteKitVigencia[]): number {
  const kwp = potenciaKitPersonalizadoKwp(
    componentes.map((c) => ({ tipo: c.tipo, potenciaW: c.potencia_w, quantidade: c.quantidade })),
  );
  return valorComoPersistido(kwp, 2);
}

/** Nome do kit personalizado dos itens atuais (na ordem em que foram salvos), igual ao `kit_nome` gravado no cálculo. */
function nomeDoKitAtual(componentes: ComponenteKitAtual[]): string {
  const ordenados = [...componentes].sort((a, b) => a.ordem - b.ordem);
  return nomeKitPersonalizado(
    ordenados.map((c) => ({ tipo: c.tipo as ComponenteKit["tipo"], descricao: c.descricao, potenciaW: c.potencia_w, quantidade: c.quantidade })),
  );
}

/** A regra tarifária de hoje ainda é a do retrato gravado? (enquadramento, linha oficial vigente e percentual do ano) */
function regraTarifariaMudou(calculo: CalculoParaVigencia, ctx: ContextoEstimativa): boolean {
  const enq = enquadramentoDoTipoCliente(ctx.tipoCliente);
  if (enq.situacao !== "ok" || rotuloEnquadramento(enq.enquadramento) !== calculo.enquadramento) return true;
  const tarifa = resolverTarifa(ctx.tarifas, ctx.distribuidoraInformada, enq.enquadramento, ctx.dataReferencia);
  if (tarifa.situacao !== "ok" || tarifa.tarifa.id !== calculo.tarifa_gd_id) return true;
  const percentual = percentualLegalFioB(ctx.dataReferencia);
  return percentual == null || calculo.percentual_legal_fio_b == null || valorComoPersistido(percentual, 3) !== valorComoPersistido(calculo.percentual_legal_fio_b, 3);
}

/**
 * Avalia se o cálculo salvo vale como atual e por quê não. Puro. `motivos` vem na ordem de relevância e sem repetição;
 * `vigente` é verdadeiro só com a lista vazia. Dado que não pode ser comprovado vira `nao_comprovado`.
 */
export function avaliarVigencia(calculo: CalculoParaVigencia, atual: EstadoAtualParaVigencia): Vigencia {
  const achados = new Set<MotivoDesatualizacao>();
  const legado = calculoEhLegado(calculo);
  const completo = calculo.estado_financeiro === "completo";

  if (legado) achados.add("legado");
  else if (calculoEhIncompleto(calculo)) achados.add("incompleta");
  if (calculo.financeiro_desatualizado_em) achados.add("desatualizado_por_entradas");

  // Kit: potência E composição.
  if (calculo.kit_id) {
    const k = atual.kitCatalogo;
    if (!k || k.id !== calculo.kit_id) achados.add("nao_comprovado");
    else if (k.nome !== calculo.kit_nome || valorComoPersistido(k.potencia_kwp, 2) !== valorComoPersistido(calculo.kit_potencia_kwp, 2)) {
      achados.add("kit");
    }
  } else if (
    potenciaDoKitKwp(atual.componentes) !== valorComoPersistido(calculo.kit_potencia_kwp, 2) ||
    nomeDoKitAtual(atual.componentes) !== calculo.kit_nome
  ) {
    achados.add("kit");
  }

  // Investimento.
  if (precoDoCalculoDesatualizado(calculo.kit_preco, atual.valorNegocio)) achados.add("preco");

  // Parâmetros, na escala do banco (numeric(4,3) e numeric(6,2)).
  const chaveDisponibilidade = (DISPONIBILIDADE_PADRAO as Record<string, keyof ParametrosAtuais | undefined>)[calculo.tipo_ligacao];
  if (!atual.parametros || !chaveDisponibilidade) {
    achados.add("nao_comprovado");
  } else {
    const p = atual.parametros;
    if (valorComoPersistido(p.produtividade_kwh_kwp_mes, 2) !== valorComoPersistido(calculo.produtividade_kwh_kwp_mes, 2)) {
      achados.add("parametros");
    }
    if (legado) {
      if (
        valorComoPersistido(p.percentual_fio_b, 3) !== valorComoPersistido(calculo.percentual_fio_b, 3) ||
        valorComoPersistido(p[chaveDisponibilidade], 2) !== valorComoPersistido(calculo.disponibilidade_kwh, 2)
      ) {
        achados.add("parametros_financeiros");
      }
    } else if (disponibilidadeArt291(calculo.tipo_ligacao) !== valorComoPersistido(calculo.disponibilidade_kwh, 2)) {
      achados.add("parametros_financeiros");
    }
  }

  // Regra tarifária de hoje x retrato (só a linha completa tem retrato que valha conferir).
  if (completo) {
    if (!atual.contexto) achados.add("nao_comprovado");
    else if (regraTarifariaMudou(calculo, atual.contexto)) achados.add("regra_tarifaria");
  }

  // Consumo: o negócio sem consumo (cálculo legado ou salvo sem consumo) não comprova nada.
  if (atual.consumoMedioKwhNegocio == null) {
    achados.add("nao_comprovado");
  } else if (valorComoPersistido(atual.consumoMedioKwhNegocio, 2) !== valorComoPersistido(calculo.consumo_medio_kwh, 2)) {
    achados.add("consumo");
  }
  // Fatura: negócio sem fatura com cálculo que a tem = legado (não comprovado); demais diferenças = mudou.
  const fatNegocio = atual.valorContaEnergiaNegocio;
  const fatCalculo = calculo.valor_fatura_medio;
  if (fatNegocio == null && fatCalculo != null) achados.add("nao_comprovado");
  else if (fatNegocio != null && (fatCalculo == null || valorComoPersistido(fatNegocio, 2) !== valorComoPersistido(fatCalculo, 2))) {
    achados.add("consumo");
  }

  const motivos = PRIORIDADE.filter((m) => achados.has(m));
  return { vigente: motivos.length === 0, motivos, naoVerificavel: [...(completo ? NAO_VERIFICAVEIS_COMPLETO : ENTRADAS_NAO_VERIFICAVEIS)] };
}

/**
 * Atalho: true quando o cálculo NÃO vale como atual. Aceita o recorte de colunas e de estado que os chamadores de
 * `src/app` (ficha, página pública, PDF) têm (só os componentes): para linha legada, incompleta ou marcada como
 * desatualizada devolve `true` sem comparar nada; só avalia de verdade com o estado completo. Dado faltante nunca vale
 * como vigente.
 */
export function calculoDesatualizado(
  calculo: Partial<CalculoParaVigencia> | null | undefined,
  atual: { componentes: ComponenteKitVigencia[] } & Partial<Omit<EstadoAtualParaVigencia, "componentes">>,
): boolean {
  if (!calculo || calculoEhLegado(calculo) || calculoEhIncompleto(calculo) || calculo.financeiro_desatualizado_em) return true;
  return !avaliarVigencia(calculo as CalculoParaVigencia, atual as EstadoAtualParaVigencia).vigente;
}

export type AcaoBloqueada = "proposta" | "contrato" | "preco";

/** Motivos que impedem a ação. Proposta e preço: todos (menos o próprio `preco` na ação de preço). Contrato: só o que o afeta. */
export function motivosDaAcao(motivos: MotivoDesatualizacao[], acao: AcaoBloqueada): MotivoDesatualizacao[] {
  if (acao === "contrato") return motivos.filter((m) => !SO_FINANCEIROS.includes(m));
  if (acao === "preco") return motivos.filter((m) => m !== "preco");
  return motivos;
}

const COMPLEMENTO: Record<AcaoBloqueada, string> = {
  proposta: "gerar a proposta",
  contrato: "gerar o contrato",
  preco: "atualizar o preço",
};

const CONSTANTE_KIT: Record<AcaoBloqueada, string> = {
  proposta: MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO,
  contrato: MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO,
  preco: MENSAGEM_PRECO_CALCULO_DESATUALIZADO,
};

/** Frase curta do motivo, para a tela (sem a ação). */
export function textoDoMotivo(motivo: MotivoDesatualizacao): string {
  switch (motivo) {
    case "legado":
      return "o último cálculo foi feito pela fórmula antiga, que não foi validada";
    case "incompleta":
      return "o último cálculo tem só o resultado técnico: a estimativa financeira está incompleta";
    case "desatualizado_por_entradas":
      return "as entradas mudaram depois do último cálculo e ainda não há resultado novo";
    case "regra_tarifaria":
      return "a tarifa oficial vigente, o percentual legal do Fio B ou o enquadramento mudaram depois do último cálculo";
    case "parametros_financeiros":
      return "os parâmetros financeiros da calculadora mudaram depois do último cálculo";
    case "kit":
      return "o kit mudou depois do último cálculo";
    case "consumo":
      return "o consumo ou a fatura mudou depois do último cálculo";
    case "parametros":
      return "os parâmetros da calculadora da empresa mudaram depois do último cálculo";
    case "preco":
      return "o valor do negócio mudou depois do último cálculo";
    case "nao_comprovado":
      return "não foi possível comprovar que o último cálculo está atualizado";
  }
}

/**
 * Mensagem de recusa citando o motivo principal (o de maior relevância). Para o motivo `kit` devolve exatamente a
 * constante `MENSAGEM_*_CALCULO_DESATUALIZADO` da ação.
 */
export function mensagemDeRecusa(motivos: MotivoDesatualizacao[], acao: AcaoBloqueada): string {
  const principal = PRIORIDADE.find((m) => motivos.includes(m)) ?? "nao_comprovado";
  if (principal === "legado" && acao === "preco") return MENSAGEM_PRECO_CALCULO_LEGADO;
  if (principal === "incompleta") {
    if (acao === "proposta") return MENSAGEM_PROPOSTA_CALCULO_INCOMPLETO;
    if (acao === "preco") return MENSAGEM_PRECO_CALCULO_INCOMPLETO;
    return `Não é possível ${COMPLEMENTO[acao]}: ${textoDoMotivo("incompleta")}.`;
  }
  if (principal === "kit") return CONSTANTE_KIT[acao];
  const texto = textoDoMotivo(principal);
  const inicio = texto.charAt(0).toUpperCase() + texto.slice(1);
  const caminho =
    principal === "preco"
      ? `Use “Atualizar preço no cálculo” antes de ${COMPLEMENTO[acao]}.`
      : `Recalcule o kit antes de ${COMPLEMENTO[acao]}.`;
  return `${inicio}. ${caminho}`;
}

type CalculoLido = Database["public"]["Tables"]["calculos_solares"]["Row"];

export type CarregamentoVigencia =
  | { ok: false; negocioAusente?: true } // falha de leitura (nunca vale como vigente); `negocioAusente` = sem erro, mas o negócio não existe/não é visível
  | { ok: true; calculo: null } // negócio sem cálculo
  | { ok: true; calculo: CalculoLido; vigencia: Vigencia; valorNegocio: number | null };

/**
 * Lê o cálculo do negócio e tudo o que é preciso para avaliar a vigência (negócio, kit, parâmetros da empresa e, para a
 * linha completa, o contexto regulatório de hoje) e devolve a avaliação. Qualquer erro de leitura ou negócio não visível
 * = `{ ok: false }`. Parâmetros ou contexto inexistentes viram `nao_comprovado` (não é erro). Funciona com o cliente do
 * usuário (RLS) ou com o cliente admin.
 */
export async function carregarVigencia(supabase: SupabaseClient<Database>, negocioId: string): Promise<CarregamentoVigencia> {
  const [negocioR, calculoR, itensR] = await Promise.all([
    supabase
      .from("negocios")
      .select("empresa_id, valor, consumo_medio_kwh, valor_conta_energia, qualif_tipo_cliente, qualif_distribuidora")
      .eq("id", negocioId)
      .maybeSingle(),
    supabase.from("calculos_solares").select("*").eq("negocio_id", negocioId).maybeSingle(),
    supabase.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade, ordem").eq("negocio_id", negocioId).order("ordem"),
  ]);
  if (negocioR.error || calculoR.error || itensR.error) return { ok: false };
  if (!negocioR.data) return { ok: false, negocioAusente: true };
  const calculo = calculoR.data;
  if (!calculo) return { ok: true, calculo: null };
  const negocio = negocioR.data;

  const [paramsR, catalogoR, contexto] = await Promise.all([
    supabase
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_mono_kwh, disponibilidade_bi_kwh, disponibilidade_tri_kwh")
      .eq("empresa_id", negocio.empresa_id)
      .maybeSingle(),
    calculo.kit_id
      ? supabase.from("kits_solares").select("id, nome, potencia_kwp").eq("id", calculo.kit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    calculo.estado_financeiro === "completo"
      ? carregarContextoEstimativa(supabase, { tipoCliente: negocio.qualif_tipo_cliente, distribuidoraInformada: negocio.qualif_distribuidora })
      : Promise.resolve(null),
  ]);
  if (paramsR.error || catalogoR.error) return { ok: false };

  const vigencia = avaliarVigencia(calculo, {
    componentes: itensR.data ?? [],
    kitCatalogo: catalogoR.data,
    valorNegocio: negocio.valor,
    consumoMedioKwhNegocio: negocio.consumo_medio_kwh,
    valorContaEnergiaNegocio: negocio.valor_conta_energia,
    parametros: paramsR.data,
    contexto,
  });
  return { ok: true, calculo, vigencia, valorNegocio: negocio.valor };
}
