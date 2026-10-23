/**
 * Dados regulatórios da estimativa GD II (puro, sem I/O): tarifa oficial por distribuidora e vigência, enquadramento do
 * negócio, percentual legal do Fio B pelo ano e custo de disponibilidade pela ligação. Usado igual pela prévia (navegador)
 * e pela gravação (servidor), para que a prévia seja o que será salvo.
 * Contrato: .aurora/contratos/m2-p0-decisao-fio-b-copel.md (seções 2, 4 e 5).
 */
import { formatarDataIso } from "@/lib/formatacao";
import type { TipoLigacao } from "@/lib/tipos";

export type BaseTributaria = "com_tributos" | "sem_tributos";

export const BASES_TRIBUTARIAS: readonly BaseTributaria[] = ["sem_tributos", "com_tributos"];

/** Linha de `tarifas_gd_aneel` (R$/MWh, como a ANEEL publica). */
export type TarifaGd = {
  id: string;
  distribuidora: string;
  nomesAceitos: string[];
  ato: string;
  subgrupo: string;
  subclasse: string;
  modalidade: string;
  baseTributaria: BaseTributaria;
  teRsMwh: number;
  tusdRsMwh: number;
  fioBRsMwh: number;
  vigenciaInicio: string; // AAAA-MM-DD
  vigenciaFim: string;
  /** O que ainda não foi lido na fonte (ex.: `tabela4_nao_conferida`). */
  pendenciasFonte: string[];
};

export const COLUNAS_TARIFA_GD =
  "id, distribuidora, nomes_aceitos, ato, subgrupo, subclasse, modalidade, base_tributaria, te_rs_mwh, tusd_rs_mwh, tusd_fio_b_rs_mwh, vigencia_inicio, vigencia_fim, pendencias_fonte";

export function tarifaGdDaLinha(l: {
  id: string;
  distribuidora: string;
  nomes_aceitos: string[];
  ato: string;
  subgrupo: string;
  subclasse: string;
  modalidade: string;
  base_tributaria: string;
  te_rs_mwh: number;
  tusd_rs_mwh: number;
  tusd_fio_b_rs_mwh: number;
  vigencia_inicio: string;
  vigencia_fim: string;
  pendencias_fonte: string[];
}): TarifaGd {
  return {
    id: l.id,
    distribuidora: l.distribuidora,
    nomesAceitos: l.nomes_aceitos,
    ato: l.ato,
    subgrupo: l.subgrupo,
    subclasse: l.subclasse,
    modalidade: l.modalidade,
    baseTributaria: l.base_tributaria as BaseTributaria,
    teRsMwh: Number(l.te_rs_mwh),
    tusdRsMwh: Number(l.tusd_rs_mwh),
    fioBRsMwh: Number(l.tusd_fio_b_rs_mwh),
    vigenciaInicio: l.vigencia_inicio,
    vigenciaFim: l.vigencia_fim,
    pendenciasFonte: l.pendencias_fonte,
  };
}

/** T oficial em R$/kWh: (TE + TUSD) / 1000, 5 casas (a ANEEL publica R$/MWh com 2 casas). */
export function tarifaOficialRsKwh(t: TarifaGd): number {
  return Math.round(((t.teRsMwh + t.tusdRsMwh) / 1000) * 1e5) / 1e5;
}

/**
 * Lei 14.300, art. 27 (GD II): fração do Fio B paga sobre a energia compensada, pelo ANO da data de referência. Só os
 * anos aceitos no contrato; fora deles não há percentual (estimativa incompleta, nunca extrapolação).
 */
export const PERCENTUAL_LEGAL_FIO_B_GD2: Readonly<Record<number, number>> = { 2026: 0.6, 2027: 0.75 };

export function percentualLegalFioB(dataReferencia: string): number | null {
  const ano = Number(dataReferencia.slice(0, 4));
  return PERCENTUAL_LEGAL_FIO_B_GD2[ano] ?? null;
}

/**
 * REN 1.000, art. 291: custo de disponibilidade em kWh pela ligação. O CRM não distingue bifásico a 2 ou 3 condutores:
 * o bifásico é tratado como 3 condutores (50 kWh), hipótese declarada nas ressalvas.
 */
export const DISPONIBILIDADE_ART_291: Readonly<Record<TipoLigacao, number>> = { monofasico: 30, bifasico: 50, trifasico: 100 };

export function disponibilidadeArt291(tipoLigacao: string): number | null {
  return (DISPONIBILIDADE_ART_291 as Record<string, number | undefined>)[tipoLigacao] ?? null;
}

/** Minúsculas, sem acento e com espaços simples: forma comparada com `nomes_aceitos`. */
export function normalizarNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Enquadramento coberto pela regra aceita: B1 residencial, convencional, GD II. */
export type Enquadramento = { subgrupo: "B1"; subclasse: "residencial"; modalidade: "convencional"; gd: "GD_II" };

export const ENQUADRAMENTO_P0: Enquadramento = { subgrupo: "B1", subclasse: "residencial", modalidade: "convencional", gd: "GD_II" };

export function rotuloEnquadramento(e: Enquadramento): string {
  return `${e.subgrupo}/${e.subclasse}/${e.modalidade}/${e.gd}`;
}

export type ResolucaoEnquadramento =
  | { situacao: "ausente" }
  | { situacao: "nao_suportado"; tipoCliente: string }
  | { situacao: "ok"; enquadramento: Enquadramento };

/**
 * Enquadramento a partir do tipo de cliente da qualificação. Só residencial tem regra validada; modalidade convencional e
 * GD II (sistema novo, Lei 14.300, art. 27) são presumidas e declaradas nas ressalvas.
 */
export function enquadramentoDoTipoCliente(tipoCliente: string | null | undefined): ResolucaoEnquadramento {
  if (!tipoCliente || !tipoCliente.trim()) return { situacao: "ausente" };
  if (tipoCliente !== "residencial") return { situacao: "nao_suportado", tipoCliente };
  return { situacao: "ok", enquadramento: ENQUADRAMENTO_P0 };
}

export type ResolucaoTarifa =
  | { situacao: "distribuidora_ausente" }
  | { situacao: "sem_tarifa"; distribuidoraInformada: string }
  | { situacao: "fora_da_vigencia"; distribuidora: string; dataReferencia: string }
  | { situacao: "ambigua"; distribuidora: string }
  | { situacao: "ok"; tarifa: TarifaGd };

/**
 * Linha oficial cuja vigência contém a data, para a distribuidora informada (comparada com `nomes_aceitos`) e o
 * enquadramento. Nunca reaproveita a linha fora da vigência; mais de uma linha vigente = ambígua (incompleta).
 */
export function resolverTarifa(
  tarifas: TarifaGd[],
  distribuidoraInformada: string | null | undefined,
  enquadramento: Enquadramento,
  dataReferencia: string,
): ResolucaoTarifa {
  if (!distribuidoraInformada || !distribuidoraInformada.trim()) return { situacao: "distribuidora_ausente" };
  const nome = normalizarNome(distribuidoraInformada);
  const daDistribuidora = tarifas.filter(
    (t) =>
      t.nomesAceitos.includes(nome) &&
      t.subgrupo === enquadramento.subgrupo &&
      t.subclasse === enquadramento.subclasse &&
      t.modalidade === enquadramento.modalidade,
  );
  if (!daDistribuidora.length) return { situacao: "sem_tarifa", distribuidoraInformada: distribuidoraInformada.trim() };
  const vigentes = daDistribuidora.filter((t) => t.vigenciaInicio <= dataReferencia && dataReferencia <= t.vigenciaFim);
  if (!vigentes.length) return { situacao: "fora_da_vigencia", distribuidora: daDistribuidora[0].distribuidora, dataReferencia };
  if (vigentes.length > 1) return { situacao: "ambigua", distribuidora: vigentes[0].distribuidora };
  return { situacao: "ok", tarifa: vigentes[0] };
}

/** O que o servidor sabe do negócio e da referência oficial no momento do cálculo (mesmo objeto na prévia). */
export type ContextoEstimativa = {
  /** Data do cálculo em America/Sao_Paulo (AAAA-MM-DD). */
  dataReferencia: string;
  /** `negocios.qualif_tipo_cliente`. */
  tipoCliente: string | null;
  /** `negocios.qualif_distribuidora` (texto livre da qualificação). */
  distribuidoraInformada: string | null;
  /** Linhas de `tarifas_gd_aneel` (tabela pequena; lida inteira). */
  tarifas: TarifaGd[];
};

/** Ressalvas (limitações declaradas) que acompanham todo resultado completo. Códigos gravados em `ressalvas`. */
export type CodigoRessalva =
  | "autoconsumo_zero"
  | "media_mensal"
  | "modalidade_convencional"
  | "gd2_sistema_novo"
  | "bifasico_tres_condutores"
  | "creditos_nao_valorados"
  | "sem_tributos"
  | "tabela4_nao_conferida"
  | "payback_indisponivel";

export function textoRessalva(codigo: string, r: { ato?: string | null; kwhNaoCompensado?: number | null } = {}): string {
  switch (codigo) {
    case "autoconsumo_zero":
      return "Autoconsumo simultâneo considerado zero: toda a geração é tratada como injetada na rede e compensada.";
    case "media_mensal":
      return "Média mensal: a sazonalidade e o piso mês a mês não são considerados.";
    case "modalidade_convencional":
      return "Tarifa convencional presumida (não tarifa branca).";
    case "gd2_sistema_novo":
      return "Sistema novo enquadrado como GD II (Lei 14.300, art. 27).";
    case "bifasico_tres_condutores":
      return "Bifásico considerado a três condutores (custo de disponibilidade de 50 kWh).";
    case "creditos_nao_valorados":
      return `${r.kwhNaoCompensado != null ? `${r.kwhNaoCompensado.toLocaleString("pt-BR")} kWh` : "Parte da energia"} injetados não compensados no mês viram crédito na distribuidora e não foram valorados.`;
    case "sem_tributos":
      return "Valores sem tributos (ICMS, PIS/Cofins), iluminação pública e bandeiras.";
    case "tabela4_nao_conferida":
      return `Desconto da Tabela 4 da ${r.ato ?? "REH"} ainda não conferido na fonte: a energia compensada usa percentual legal × Fio B.`;
    case "payback_indisponivel":
      return "Payback indisponível: depende de projeção de tarifas e da transição da Lei 14.300 (75% em 2027, 90% em 2028).";
    default:
      return codigo;
  }
}

/** "24/06/2026 a 23/06/2027" */
export function textoVigencia(inicio: string, fim: string): string {
  return `${formatarDataIso(inicio)} a ${formatarDataIso(fim)}`;
}
