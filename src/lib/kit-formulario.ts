import type { LinhaComponente } from "@/components/kit-componentes";
import { formatarNumeroBr } from "@/lib/formatacao";
import type { BaseTributaria } from "@/lib/tarifa-gd";
import type { TipoComponenteKit, TipoLigacao } from "@/lib/tipos";

/** O que está gravado do kit do negócio (itens, cálculo e dados do negócio usados no formulário). */
export type KitSalvo = {
  componentesSalvos: { tipo: TipoComponenteKit; descricao: string; potenciaW: number | null; quantidade: number }[];
  calculo: {
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
    /** Base declarada da tarifa gravada; nula na linha legada ou sem declaração. */
    tarifaBaseTributaria?: BaseTributaria | null;
  } | null;
  estruturaTelhado: string | null;
  consumoMedioKwhPadrao: number | null;
  valorFaturaMedioPadrao: number | null;
  /** Tarifa oficial vigente (TE + TUSD, sem tributos) para o negócio; nula = não resolvida. */
  tarifaOficialRsKwh?: number | null;
};

export type EstadoFormularioKit = {
  linhas: LinhaComponente[];
  estrutura: string;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: string;
  valorFaturaMedio: string;
  tarifaKwh: string;
  /** "" = não declarada. */
  tarifaBaseTributaria: BaseTributaria | "";
};

// Inverso exato de `lerNumeroBr`: reabrir e salvar sem editar não muda nenhum valor (antes, 1200
// reabria como "1.200" e voltava como 1,2; a tarifa com 4 casas perdia as duas últimas).
const numeroBr = formatarNumeroBr;

/**
 * Estado do formulário do kit exatamente como está gravado. Usado ao abrir o cartão e no
 * Cancelar: sem kit salvo, volta tudo vazio (descarta os itens não gravados); com kit salvo,
 * volta aos dados persistidos. Consumo e valor da conta vêm sempre do negócio (valores atuais), nunca do cálculo
 * salvo: salvar sem editar não pode levar ao negócio o valor antigo. Sem o dado, o campo abre vazio.
 * Tarifa: a gravada no cálculo, com a base gravada (linha legada abre sem base: precisa ser declarada); sem cálculo,
 * abre com a tarifa oficial vigente e a base dela (sem tributos), editável.
 */
export function estadoSalvoDoKit(k: KitSalvo): EstadoFormularioKit {
  const fatura = k.valorFaturaMedioPadrao;
  const consumo = k.consumoMedioKwhPadrao;
  const oficial = k.tarifaOficialRsKwh ?? null;
  return {
    linhas: k.componentesSalvos.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      potenciaW: c.potenciaW != null ? numeroBr(c.potenciaW) : "",
      quantidade: String(c.quantidade),
    })),
    estrutura: k.estruturaTelhado ?? "",
    tipoLigacao: k.calculo?.tipoLigacao ?? "trifasico",
    consumoMedioKwh: consumo != null ? numeroBr(consumo) : "",
    valorFaturaMedio: fatura != null ? numeroBr(fatura) : "",
    tarifaKwh: k.calculo ? numeroBr(k.calculo.tarifaKwh) : oficial != null ? numeroBr(oficial) : "",
    tarifaBaseTributaria: k.calculo ? (k.calculo.tarifaBaseTributaria ?? "") : oficial != null ? "sem_tributos" : "",
  };
}
