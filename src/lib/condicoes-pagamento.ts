import { z } from "zod";

/**
 * Condições de pagamento — configuração da empresa (migration 20261102180000_condicoes_pagamento_config.sql):
 * desconto máximo à vista sem aprovação por papel, Personalizado disponível ou não e as parcelas de cartão e boleto
 * com a taxa de cada uma. Funções puras: a tela e as ações usam as mesmas regras.
 */

export const MEIOS_PARCELAMENTO = ["cartao", "boleto"] as const;
export type MeioParcelamento = (typeof MEIOS_PARCELAMENTO)[number];
export const ROTULO_MEIO_PARCELAMENTO: Record<MeioParcelamento, string> = { cartao: "Cartão", boleto: "Boleto" };

export const MAX_PARCELAS = 24;

export type PreferenciasCondicoes = { descontoMaxVendedor: number; descontoMaxGestor: number; personalizadoAtivo: boolean };

/** Sem linha gravada: nenhum desconto sem aprovação e Personalizado disponível. */
export const PREFERENCIAS_PADRAO: PreferenciasCondicoes = { descontoMaxVendedor: 0, descontoMaxGestor: 0, personalizadoAtivo: true };

export function preferenciasDaEmpresa(
  linha: { desconto_max_vendedor: number; desconto_max_gestor: number; personalizado_ativo: boolean } | null | undefined,
): PreferenciasCondicoes {
  if (!linha) return PREFERENCIAS_PADRAO;
  return {
    descontoMaxVendedor: Number(linha.desconto_max_vendedor),
    descontoMaxGestor: Number(linha.desconto_max_gestor),
    personalizadoAtivo: linha.personalizado_ativo,
  };
}

/** Aceita "5", "5,5" ou "5.5". */
const percentual = (max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= max, `${rotulo}: use um número de 0 a ${max}.`)
    .transform((v) => Math.round(v * 100) / 100);

export const esquemaPreferencias = z.object({
  descontoMaxVendedor: percentual(100, "Desconto do vendedor"),
  descontoMaxGestor: percentual(100, "Desconto do gestor"),
  personalizadoAtivo: z.enum(["on"]).optional().transform((v) => v === "on"),
});

/**
 * Valor do negócio quando o vendedor registra a condição que o cliente escolheu (migration
 * 20261103100000_condicao_escolhida_contrato.sql): por modalidade, o preço do sistema da proposta ou o total que o
 * cliente paga naquela condição.
 */
export const MODALIDADES = ["aVista", "parcelado", "financiamento", "personalizado"] as const;
export type Modalidade = (typeof MODALIDADES)[number];
export const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  aVista: "À vista",
  parcelado: "Parcelado (cartão ou boleto)",
  financiamento: "Financiamento",
  personalizado: "Personalizado",
};
export const BASES_VALOR_NEGOCIO = ["preco", "total_cliente"] as const;
export type BaseValorNegocio = (typeof BASES_VALOR_NEGOCIO)[number];
export type ValorNegocioPorModalidade = Record<Modalidade, BaseValorNegocio>;
/** Total pago pelo cliente em cada modalidade, para a tela explicar a opção. */
export const ROTULO_TOTAL_CLIENTE: Record<Modalidade, string> = {
  aVista: "Total pago pelo cliente (com o desconto)",
  parcelado: "Total pago pelo cliente (parcelas somadas)",
  financiamento: "Total pago pelo cliente (entrada + parcelas)",
  personalizado: "Total pago pelo cliente (soma das partes)",
};

/** Sem linha gravada: à vista e Personalizado mudam o valor; parcelado e financiamento não (decisão de 02/11/2026). */
export const VALOR_NEGOCIO_PADRAO: ValorNegocioPorModalidade = { aVista: "total_cliente", parcelado: "preco", financiamento: "preco", personalizado: "total_cliente" };

const base = (v: string | null | undefined, padrao: BaseValorNegocio): BaseValorNegocio => (v === "preco" || v === "total_cliente" ? v : padrao);

export function valorNegocioDaEmpresa(
  linha:
    | { valor_negocio_avista: string; valor_negocio_parcelado: string; valor_negocio_financiamento: string; valor_negocio_personalizado: string }
    | null
    | undefined,
): ValorNegocioPorModalidade {
  const p = VALOR_NEGOCIO_PADRAO;
  return {
    aVista: base(linha?.valor_negocio_avista, p.aVista),
    parcelado: base(linha?.valor_negocio_parcelado, p.parcelado),
    financiamento: base(linha?.valor_negocio_financiamento, p.financiamento),
    personalizado: base(linha?.valor_negocio_personalizado, p.personalizado),
  };
}

export const esquemaValorNegocio = z.object({
  aVista: z.enum(BASES_VALOR_NEGOCIO),
  parcelado: z.enum(BASES_VALOR_NEGOCIO),
  financiamento: z.enum(BASES_VALOR_NEGOCIO),
  personalizado: z.enum(BASES_VALOR_NEGOCIO),
});

export type TaxaParcela = { parcelas: number; taxa: number };

/**
 * Lê a tabela de um meio do formulário: para cada parcela de 1 a 24, `disponivel_<n>` marcado e `taxa_<n>` (0 a
 * 99,99%). Parcela desmarcada fica de fora; nenhuma marcada = meio indisponível.
 */
export function lerTaxasDoFormulario(dados: FormData): { ok: true; taxas: TaxaParcela[] } | { ok: false; mensagem: string } {
  const taxas: TaxaParcela[] = [];
  const taxa = percentual(99.99, "Taxa");
  for (let n = 1; n <= MAX_PARCELAS; n++) {
    if (dados.get(`disponivel_${n}`) !== "on") continue;
    const lida = taxa.safeParse(String(dados.get(`taxa_${n}`) ?? ""));
    if (!lida.success) return { ok: false, mensagem: `${n}x — ${lida.error.issues[0].message}` };
    taxas.push({ parcelas: n, taxa: lida.data });
  }
  return { ok: true, taxas };
}
