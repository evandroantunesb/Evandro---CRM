/**
 * Vigência do cálculo solar salvo (`calculos_solares`) frente ao estado atual do negócio.
 *
 * Regra (Evandro, M2-B6/B7): comparam-se SOMENTE as entradas que têm fonte independente. O que não tem fonte
 * (tarifa, tipo de ligação, Fio B, enquadramento) NÃO é comparado: fica registrado em `naoVerificavel`, separado de
 * `vigente`, e nunca vira "atual". O cálculo nunca é comparado consigo mesmo. Sem migration.
 *
 * `legado`: toda linha existente foi gerada pela fórmula antiga (não validada) e não há coluna de método que
 * distinga outra coisa; logo, hoje, TODA linha tem o motivo `legado` e `vigente` é sempre falso. O motivo some
 * quando a fórmula validada existir e a linha tiver método.
 *
 * Guardas por ação (`motivosDaAcao`): proposta e preço recusam com qualquer motivo (inclui `legado`); o contrato
 * considera só o que afeta o contrato (kit, preço, produtividade, consumo) e ignora `legado` e os parâmetros
 * financeiros.
 *
 * O que é comparado (e contra qual fonte atual):
 *  - kit: potência (2 casas) E composição. Kit personalizado (`kit_id` nulo): `nomeKitPersonalizado(itens atuais)`
 *    === `kit_nome`. Kit de catálogo (`kit_id` preenchido): nome e potência do registro de `kits_solares`.
 *  - investimento: `kit_preco` x `negocios.valor` (`precoDoCalculoDesatualizado`).
 *  - parâmetros da empresa: `percentual_fio_b`, `produtividade_kwh_kwp_mes` e `disponibilidade_kwh` (pelo
 *    `tipo_ligacao` do cálculo) x `parametros_calculadora` atual, na escala do banco.
 *  - consumo/fatura: `consumo_medio_kwh` e `valor_fatura_medio` x `negocios.consumo_medio_kwh` e
 *    `negocios.valor_conta_energia` (`salvarKitComCliente` grava os valores enviados no negócio a cada salvamento).
 *
 * NÃO verificável hoje (lacuna que só uma migration fecha): tarifa (`tarifa_kwh`), tipo de ligação, Fio B e
 * enquadramento; ver `.aurora/contratos/m2-p0-calculo-vigencia.md`.
 */
import { potenciaKitPersonalizadoKwp, nomeKitPersonalizado, DISPONIBILIDADE_PADRAO, type ComponenteKit } from "@/lib/calculadora";
import { precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { valorComoPersistido } from "@/lib/consumo-persistido";
import { mensagemPropostaIncompleta, pendenciasSemDados } from "@/lib/estimativa-financeira";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const MENSAGEM_CALCULO_DESATUALIZADO =
  "Último cálculo — desatualizado: o kit mudou depois dele. Complete os dados para recalcular.";

export const MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO =
  "O kit mudou depois do último cálculo. Complete os dados e recalcule antes de gerar a proposta.";

export const MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO = "O kit mudou depois do último cálculo. Recalcule antes de gerar o contrato.";

export const MENSAGEM_PRECO_CALCULO_DESATUALIZADO = "O kit mudou depois do último cálculo: recalcule o kit antes de atualizar o preço.";

export const MENSAGEM_PRECO_CALCULO_LEGADO =
  "O cálculo salvo foi feito pela fórmula antiga, que não foi validada: o preço não pode ser atualizado nele. Aguarde a validação da estimativa financeira.";

/** Por que o cálculo salvo não vale como atual. */
export type MotivoDesatualizacao =
  | "legado" // linha gerada pela fórmula antiga (não validada): hoje, toda linha existente
  | "kit"
  | "consumo"
  | "parametros" // produtividade (afeta a geração, logo o contrato)
  | "parametros_financeiros" // percentual do Fio B e disponibilidade (só afetam a parte financeira)
  | "preco"
  | "nao_comprovado";

/** Ordem de relevância: o primeiro motivo da lista é o "principal" citado nas mensagens. */
const PRIORIDADE: MotivoDesatualizacao[] = ["legado", "kit", "consumo", "parametros", "parametros_financeiros", "preco", "nao_comprovado"];

/** Entradas do cálculo SEM fonte independente atual: registradas, nunca comparadas nem rotuladas como atuais. */
export type EntradaNaoVerificavel = "tarifa" | "tipo_ligacao" | "fio_b" | "enquadramento";

export const ENTRADAS_NAO_VERIFICAVEIS: readonly EntradaNaoVerificavel[] = ["tarifa", "tipo_ligacao", "fio_b", "enquadramento"];

/** `vigente` só reflete as entradas verificáveis; `naoVerificavel` é a lista do que não foi (nem pode ser) conferido. */
export type Vigencia = { vigente: boolean; motivos: MotivoDesatualizacao[]; naoVerificavel: EntradaNaoVerificavel[] };

/**
 * Verdadeiro para a linha gerada pela fórmula antiga. Sem coluna de método (sem migration), toda linha existente é
 * legada por definição. Ponto de extensão: com a fórmula validada, a linha passará a trazer o método.
 */
export function calculoEhLegado(calculo?: unknown): boolean {
  void calculo;
  return true;
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

/**
 * Avalia se o cálculo salvo vale como atual e por quê não. Puro. `motivos` vem na ordem de relevância e sem repetição;
 * `vigente` é verdadeiro só com a lista vazia. Dado que não pode ser comprovado vira `nao_comprovado`.
 */
export function avaliarVigencia(calculo: CalculoParaVigencia, atual: EstadoAtualParaVigencia): Vigencia {
  const achados = new Set<MotivoDesatualizacao>();

  if (calculoEhLegado(calculo)) achados.add("legado");

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

  // Parâmetros da empresa, na escala do banco (numeric(4,3) e numeric(6,2)).
  const chaveDisponibilidade = (DISPONIBILIDADE_PADRAO as Record<string, keyof ParametrosAtuais | undefined>)[calculo.tipo_ligacao];
  if (!atual.parametros || !chaveDisponibilidade) {
    achados.add("nao_comprovado");
  } else {
    const p = atual.parametros;
    if (valorComoPersistido(p.produtividade_kwh_kwp_mes, 2) !== valorComoPersistido(calculo.produtividade_kwh_kwp_mes, 2)) {
      achados.add("parametros");
    }
    if (
      valorComoPersistido(p.percentual_fio_b, 3) !== valorComoPersistido(calculo.percentual_fio_b, 3) ||
      valorComoPersistido(p[chaveDisponibilidade], 2) !== valorComoPersistido(calculo.disponibilidade_kwh, 2)
    ) {
      achados.add("parametros_financeiros");
    }
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
  return { vigente: motivos.length === 0, motivos, naoVerificavel: [...ENTRADAS_NAO_VERIFICAVEIS] };
}

/**
 * Atalho: true quando o cálculo NÃO vale como atual. Hoje sempre verdadeiro (`legado`).
 * Aceita o recorte de colunas e de estado que os chamadores de `src/app` (ficha, página pública, PDF) têm (só os
 * componentes): para linha legada devolve `true` sem comparar nada; só avalia de verdade com o estado completo.
 * Dado faltante nunca vale como vigente.
 */
export function calculoDesatualizado(
  calculo: Partial<CalculoParaVigencia> | null | undefined,
  atual: { componentes: ComponenteKitVigencia[] } & Partial<Omit<EstadoAtualParaVigencia, "componentes">>,
): boolean {
  if (!calculo || calculoEhLegado(calculo)) return true;
  return !avaliarVigencia(calculo as CalculoParaVigencia, atual as EstadoAtualParaVigencia).vigente;
}

export type AcaoBloqueada = "proposta" | "contrato" | "preco";

/** Motivos que impedem a ação. Proposta e preço: todos (menos o próprio `preco` na ação de preço). Contrato: só o que o afeta. */
export function motivosDaAcao(motivos: MotivoDesatualizacao[], acao: AcaoBloqueada): MotivoDesatualizacao[] {
  if (acao === "contrato") return motivos.filter((m) => m !== "legado" && m !== "parametros_financeiros");
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
    case "parametros_financeiros":
      return "os parâmetros financeiros da calculadora da empresa mudaram depois do último cálculo";
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
  if (principal === "legado") {
    if (acao === "proposta") return mensagemPropostaIncompleta(pendenciasSemDados(), `${textoDoMotivo("legado")}`);
    if (acao === "preco") return MENSAGEM_PRECO_CALCULO_LEGADO;
    return `Não é possível ${COMPLEMENTO[acao]}: ${textoDoMotivo("legado")}.`;
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
 * Lê o cálculo do negócio e tudo o que é preciso para avaliar a vigência (negócio, kit, parâmetros da empresa) e
 * devolve a avaliação. Qualquer erro de leitura ou negócio não visível = `{ ok: false }`. Parâmetros inexistentes
 * viram `nao_comprovado` (não é erro). Funciona com o cliente do usuário (RLS) ou com o cliente admin.
 */
export async function carregarVigencia(supabase: SupabaseClient<Database>, negocioId: string): Promise<CarregamentoVigencia> {
  const [negocioR, calculoR, itensR] = await Promise.all([
    supabase.from("negocios").select("empresa_id, valor, consumo_medio_kwh, valor_conta_energia").eq("id", negocioId).maybeSingle(),
    supabase.from("calculos_solares").select("*").eq("negocio_id", negocioId).maybeSingle(),
    supabase.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade, ordem").eq("negocio_id", negocioId).order("ordem"),
  ]);
  if (negocioR.error || calculoR.error || itensR.error) return { ok: false };
  if (!negocioR.data) return { ok: false, negocioAusente: true };
  const calculo = calculoR.data;
  if (!calculo) return { ok: true, calculo: null };
  const negocio = negocioR.data;

  const [paramsR, catalogoR] = await Promise.all([
    supabase
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_mono_kwh, disponibilidade_bi_kwh, disponibilidade_tri_kwh")
      .eq("empresa_id", negocio.empresa_id)
      .maybeSingle(),
    calculo.kit_id
      ? supabase.from("kits_solares").select("id, nome, potencia_kwp").eq("id", calculo.kit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (paramsR.error || catalogoR.error) return { ok: false };

  const vigencia = avaliarVigencia(calculo, {
    componentes: itensR.data ?? [],
    kitCatalogo: catalogoR.data,
    valorNegocio: negocio.valor,
    consumoMedioKwhNegocio: negocio.consumo_medio_kwh,
    valorContaEnergiaNegocio: negocio.valor_conta_energia,
    parametros: paramsR.data,
  });
  return { ok: true, calculo, vigencia, valorNegocio: negocio.valor };
}
