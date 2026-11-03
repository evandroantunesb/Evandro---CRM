/**
 * Pendências da estimativa financeira GD II (puro, sem I/O, sem "server-only"). Regra de ouro: informação ausente NUNCA
 * vira zero, tarifa padrão nem percentual inventado; qualquer pendência = estimativa incompleta.
 * Contrato aceito: .aurora/contratos/m2-p0-decisao-fio-b-copel.md. Os dados regulatórios vêm de `tarifa-gd.ts`.
 */
import { formatarDataIso, hojeEmSaoPaulo } from "@/lib/formatacao";
import {
  enquadramentoDoTipoCliente,
  percentualLegalFioB,
  resolverTarifa,
  type BaseTributaria,
  type ContextoEstimativa,
  type Enquadramento,
  type TarifaGd,
} from "@/lib/tarifa-gd";

export type { BaseTributaria };

export type CodigoPendencia =
  | "enquadramento_ausente"
  | "enquadramento_nao_suportado"
  | "distribuidora_ausente"
  | "distribuidora_sem_tarifa"
  | "fio_b_vigencia_fora"
  | "tarifa_vigente_ambigua"
  | "percentual_legal_indisponivel"
  | "tarifa_base_ausente"
  | "consumo_ausente"
  | "consumo_estimado_pela_tarifa_base"
  | "base_tributaria_ausente"
  | "base_tributaria_divergente"
  | "tarifa_abaixo_do_fio_b";

export type Pendencia = { codigo: CodigoPendencia; mensagem: string };

export type EntradaEstimativa = {
  contexto: ContextoEstimativa | null;
  tarifaBaseRsKwh: number | null;
  tarifaBaseBaseTributaria: BaseTributaria | null;
  consumoMedioKwh: number | null;
  consumoOrigem: "informado" | "estimado_conta" | null;
  tarifaEfetivaContaRsKwh: number | null;
};

/** Dados regulatórios resolvidos (só existem sem nenhuma pendência). */
export type DadosRegulatorios = { enquadramento: Enquadramento; tarifa: TarifaGd; percentualLegal: number; dataReferencia: string };

export type AvaliacaoEstimativa = { pendencias: Pendencia[]; dados: DadosRegulatorios | null };

/** Número finito e positivo; NaN/Infinity/null/undefined contam como ausentes. */
function positivo(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Acumula TODAS as pendências aplicáveis, em ordem estável, e devolve os dados regulatórios quando nada falta.
 * A comparação T > N (tarifa acima do custo da energia compensada) é feita aqui, com os dados resolvidos.
 */
export function avaliarEstimativa(e: EntradaEstimativa): AvaliacaoEstimativa {
  const p: Pendencia[] = [];
  const add = (codigo: CodigoPendencia, mensagem: string) => p.push({ codigo, mensagem });
  const ctx = e.contexto;
  const dataReferencia = ctx?.dataReferencia ?? hojeIso();

  const enq = enquadramentoDoTipoCliente(ctx?.tipoCliente);
  if (enq.situacao === "ausente") {
    add("enquadramento_ausente", "Informe o tipo de cliente na Qualificação SDR (a estimativa cobre cliente residencial).");
  } else if (enq.situacao === "nao_suportado") {
    add("enquadramento_nao_suportado", "Enquadramento sem regra validada: a estimativa cobre só cliente residencial (B1 convencional, GD II).");
  }

  const tarifa =
    enq.situacao === "ok" ? resolverTarifa(ctx?.tarifas ?? [], ctx?.distribuidoraInformada, enq.enquadramento, dataReferencia) : null;
  if (tarifa?.situacao === "distribuidora_ausente" || (!tarifa && !ctx?.distribuidoraInformada?.trim())) {
    add("distribuidora_ausente", "Informe a distribuidora de energia na Qualificação SDR.");
  } else if (tarifa?.situacao === "sem_tarifa") {
    add("distribuidora_sem_tarifa", `Não há tarifa oficial cadastrada para a distribuidora informada (“${tarifa.distribuidoraInformada}”).`);
  } else if (tarifa?.situacao === "fora_da_vigencia") {
    add("fio_b_vigencia_fora", `Sem tarifa vigente da ${tarifa.distribuidora} para ${formatarDataIso(dataReferencia)}.`);
  } else if (tarifa?.situacao === "ambigua") {
    add("tarifa_vigente_ambigua", `Há mais de uma tarifa oficial vigente da ${tarifa.distribuidora} nesta data.`);
  }

  const percentual = percentualLegalFioB(dataReferencia);
  if (percentual == null) {
    add(
      "percentual_legal_indisponivel",
      `O percentual legal do Fio B para ${dataReferencia.slice(0, 4)} não está na regra aceita (2026: 60%; 2027: 75%).`,
    );
  }

  if (!positivo(e.tarifaBaseRsKwh)) add("tarifa_base_ausente", "Informe a tarifa (R$/kWh).");
  if (!positivo(e.consumoMedioKwh)) add("consumo_ausente", "Informe o consumo médio em kWh.");
  if (e.consumoOrigem === "estimado_conta" && !positivo(e.tarifaEfetivaContaRsKwh)) {
    add(
      "consumo_estimado_pela_tarifa_base",
      "O consumo veio do valor da conta em R$: informe o consumo em kWh ou a tarifa efetiva da conta (não é possível estimar pela tarifa base).",
    );
  }

  // Base tributária: declarada e igual à do Fio B oficial (sem conversão automática).
  if (e.tarifaBaseBaseTributaria == null) {
    add("base_tributaria_ausente", "Declare se a tarifa informada inclui tributos.");
  } else if (tarifa?.situacao === "ok" && tarifa.tarifa.baseTributaria !== e.tarifaBaseBaseTributaria) {
    add(
      "base_tributaria_divergente",
      "A tarifa informada inclui tributos e o Fio B oficial não: use a tarifa sem tributos (a conversão não é feita automaticamente).",
    );
  }

  let dados: DadosRegulatorios | null = null;
  if (enq.situacao === "ok" && tarifa?.situacao === "ok" && percentual != null) {
    const n = (percentual * tarifa.tarifa.fioBRsMwh) / 1000;
    if (positivo(e.tarifaBaseRsKwh) && !(e.tarifaBaseRsKwh > n)) {
      add("tarifa_abaixo_do_fio_b", "A tarifa informada precisa ser maior que o custo da energia compensada (Fio B × percentual legal).");
    }
    dados = { enquadramento: enq.enquadramento, tarifa: tarifa.tarifa, percentualLegal: percentual, dataReferencia };
  }

  return { pendencias: p, dados: p.length ? null : dados };
}

/** Data de hoje em America/Sao_Paulo (AAAA-MM-DD): referência da vigência e do percentual legal. */
export function hojeIso(): string {
  return hojeEmSaoPaulo();
}

/** Pendências quando NENHUM dado da estimativa está disponível. */
export function pendenciasSemDados(): Pendencia[] {
  return avaliarEstimativa({
    contexto: null,
    tarifaBaseRsKwh: null,
    tarifaBaseBaseTributaria: null,
    consumoMedioKwh: null,
    consumoOrigem: null,
    tarifaEfetivaContaRsKwh: null,
  }).pendencias;
}

/** Lista as pendências em uma frase só, sem o ponto final de cada item. */
export function listaDePendencias(pendencias: Pendencia[]): string {
  return pendencias.map((p) => p.mensagem.replace(/\.\s*$/, "")).join("; ");
}

/** Mensagem exata de proposta bloqueada. `extra` (ex.: "o cálculo salvo usa a fórmula antiga") vem antes da lista. */
export function mensagemPropostaIncompleta(pendencias: Pendencia[], extra?: string): string {
  const itens = [extra, listaDePendencias(pendencias)].filter(Boolean).join("; ");
  return `A estimativa financeira está incompleta: ${itens}. A proposta fica disponível quando os dados forem validados.`;
}
