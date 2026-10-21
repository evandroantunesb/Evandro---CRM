/**
 * Contrato do estado "estimativa financeira incompleta" da calculadora solar (puro, sem I/O, sem "server-only").
 * NÃO contém fórmula de economia nem de Fio B. Regra de ouro: informação ausente NUNCA vira zero,
 * tarifa padrão nem percentual inventado.
 */

/** Recorte P0 (decisão do Evandro): qualquer outro enquadramento é "não suportado", sem enquadramento automático. */
export const RECORTE_P0 = { classe: "B1", modalidade: "convencional", gd: "GD_II", anoReferencia: 2026 } as const;

export type EnquadramentoEntrada = {
  classe: string | null;
  modalidade: string | null;
  gd: string | null;
  anoReferencia: number | null;
};

export type OrigemParametro = "oficial_aneel" | "manual_justificado";
export type BaseTributaria = "com_tributos" | "sem_tributos";

export type ParametrosFioB = {
  fioBRsKwh: number | null;
  baseTributaria: BaseTributaria | null;
  origem: OrigemParametro | null;
  distribuidora: string | null;
  fonte: string | null;
  vigenciaInicio: string | null; // AAAA-MM-DD
  vigenciaFim: string | null;
  justificativa: string | null;
};

export type CodigoPendencia =
  | "enquadramento_nao_suportado"
  | "enquadramento_ausente"
  | "distribuidora_ausente"
  | "tarifa_base_ausente"
  | "consumo_ausente"
  | "consumo_estimado_pela_tarifa_base"
  | "fio_b_ausente"
  | "fio_b_origem_ausente"
  | "fio_b_manual_sem_justificativa"
  | "fio_b_vigencia_ausente"
  | "fio_b_vigencia_fora"
  | "base_tributaria_divergente"
  | "percentual_legal_indisponivel";

export type Pendencia = { codigo: CodigoPendencia; mensagem: string };

export type EntradaEstimativa = {
  enquadramento: EnquadramentoEntrada;
  tarifaBaseRsKwh: number | null;
  tarifaBaseBaseTributaria: BaseTributaria | null;
  consumoMedioKwh: number | null;
  consumoOrigem: "informado" | "estimado_conta" | null;
  tarifaEfetivaContaRsKwh: number | null;
  parametrosFioB: ParametrosFioB | null;
  dataReferencia: string; // AAAA-MM-DD
};

export type EstimativaFinanceira =
  | { estado: "incompleta"; pendencias: Pendencia[]; geracaoEstimadaKwhMes: number | null; potenciaKwp: number | null }
  | { estado: "completa" /* campos de economia serão definidos após aprovação da fórmula */ };

/** Percentual legal da parcela do Fio B: GD II em 2026 = 60%. Qualquer outro enquadramento = null. O vendedor nunca informa. */
export function percentualLegalFioB(enq: EnquadramentoEntrada): number | null {
  return enq.gd === RECORTE_P0.gd && enq.anoReferencia === RECORTE_P0.anoReferencia ? 0.6 : null;
}

/** Número finito e positivo; NaN/Infinity/null/undefined contam como ausentes. */
function positivo(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function textoPreenchido(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Acumula TODAS as pendências aplicáveis, em ordem estável. */
export function avaliarCompletude(e: EntradaEstimativa): { completa: true } | { completa: false; pendencias: Pendencia[] } {
  const p: Pendencia[] = [];
  const add = (codigo: CodigoPendencia, mensagem: string) => p.push({ codigo, mensagem });
  const enq = e.enquadramento;
  const fio = e.parametrosFioB;

  // Enquadramento
  const ausente =
    !textoPreenchido(enq.classe) ||
    !textoPreenchido(enq.modalidade) ||
    !textoPreenchido(enq.gd) ||
    typeof enq.anoReferencia !== "number" ||
    !Number.isFinite(enq.anoReferencia);
  if (ausente) {
    add("enquadramento_ausente", "Informe o enquadramento (classe, modalidade, GD e ano de referência) para estimar a economia.");
  } else if (
    enq.classe !== RECORTE_P0.classe ||
    enq.modalidade !== RECORTE_P0.modalidade ||
    enq.gd !== RECORTE_P0.gd ||
    enq.anoReferencia !== RECORTE_P0.anoReferencia
  ) {
    add("enquadramento_nao_suportado", "Enquadramento não suportado: por ora só B1 residencial convencional, GD II, ano de 2026.");
    add("percentual_legal_indisponivel", "O percentual legal do Fio B não está disponível para este enquadramento.");
  }

  if (!textoPreenchido(fio?.distribuidora)) add("distribuidora_ausente", "Informe a distribuidora de energia.");

  if (!positivo(e.tarifaBaseRsKwh)) add("tarifa_base_ausente", "Informe a tarifa base da distribuidora (R$/kWh).");
  if (!positivo(e.consumoMedioKwh)) add("consumo_ausente", "Informe o consumo médio em kWh.");

  if (e.consumoOrigem === "estimado_conta" && !positivo(e.tarifaEfetivaContaRsKwh)) {
    add(
      "consumo_estimado_pela_tarifa_base",
      "O consumo veio do valor da conta em R$: informe o consumo em kWh ou a tarifa efetiva da conta (não é possível estimar pela tarifa base).",
    );
  }

  // Fio B
  if (!fio || !positivo(fio.fioBRsKwh)) {
    add("fio_b_ausente", "Informe o valor do Fio B (R$/kWh) da distribuidora.");
  }
  if (fio) {
    if (fio.origem == null) {
      add("fio_b_origem_ausente", "Informe a origem do valor do Fio B (oficial ANEEL ou manual justificado).");
    } else if (fio.origem === "manual_justificado" && (!textoPreenchido(fio.justificativa) || !textoPreenchido(fio.fonte))) {
      add("fio_b_manual_sem_justificativa", "Fio B manual exige justificativa e fonte.");
    }
    if (!textoPreenchido(fio.vigenciaInicio) || !textoPreenchido(fio.vigenciaFim)) {
      add("fio_b_vigencia_ausente", "Informe o início e o fim da vigência do Fio B.");
    } else if (e.dataReferencia < fio.vigenciaInicio! || e.dataReferencia > fio.vigenciaFim!) {
      add("fio_b_vigencia_fora", "A data de referência está fora da vigência informada do Fio B.");
    }
  }

  // Base tributária: Fio B ausente ou diferente da tarifa base
  if (!fio || fio.baseTributaria == null || e.tarifaBaseBaseTributaria == null || fio.baseTributaria !== e.tarifaBaseBaseTributaria) {
    add("base_tributaria_divergente", "O Fio B e a tarifa base precisam estar na mesma base tributária (com ou sem tributos).");
  }

  return p.length ? { completa: false, pendencias: p } : { completa: true };
}
