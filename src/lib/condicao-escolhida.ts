import { z } from "zod";
import { ROTULO_MEIO_PARCELAMENTO, type BaseValorNegocio, type Modalidade, type ValorNegocioPorModalidade } from "@/lib/condicoes-pagamento";
import { ROTULO_FORMA, ROTULO_MOMENTO, formatarPercentual, type CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda } from "@/lib/formatacao";

/**
 * Condição escolhida pelo cliente no contrato (PR 4 das condições de pagamento): as opções que o vendedor pode registrar
 * saem da última proposta emitida (esquema 5, dentro da validade); cada uma diz o valor que o negócio passa a ter pela
 * regra da empresa (preço do sistema ou total pago pelo cliente) e o texto que entra no contrato
 * (`{{condicao_pagamento}}`). Funções puras: a ficha mostra e o servidor confere com as mesmas contas.
 */

export type OpcaoEscolha = {
  /** Estável dentro de uma emissão: "aVista", "parcelado:10", "financiamento:0", "personalizado". */
  id: string;
  modalidade: Modalidade;
  /** Rótulo do grupo na tela ("Cartão de crédito", "Financiamento · Banco X"). */
  grupo: string;
  titulo: string;
  detalhe: string | null;
  /** Valor do negócio se esta opção for registrada, e de onde ele vem pela regra da empresa. */
  valorNegocio: number;
  base: BaseValorNegocio;
  /** A condição por extenso, como vai no contrato. */
  descricao: string;
};

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function opcoesDeEscolha(c: CondicoesEmitidas, preco: number, regra: ValorNegocioPorModalidade): OpcaoEscolha[] {
  const valor = (m: Modalidade, totalCliente: number) => (regra[m] === "preco" ? preco : totalCliente);
  const opcoes: OpcaoEscolha[] = [];

  if (c.aVista) {
    const desconto = c.aVista.descontoPercentual > 0 ? ` (${formatarPercentual(c.aVista.descontoPercentual)}% de desconto)` : "";
    opcoes.push({
      id: "aVista",
      modalidade: "aVista",
      base: regra["aVista"],
      grupo: "À vista",
      titulo: formatarMoeda(c.aVista.valor),
      detalhe: desconto ? desconto.slice(2, -1) : null,
      valorNegocio: valor("aVista", c.aVista.valor),
      descricao: `À vista: ${formatarMoeda(c.aVista.valor)}${desconto}.`,
    });
  }
  if (c.parcelado) {
    const meio = c.parcelado.meio === "cartao" ? "Cartão de crédito" : "Boleto parcelado";
    for (const o of c.parcelado.opcoes) {
      opcoes.push({
        id: `parcelado:${o.parcelas}`,
        modalidade: "parcelado",
      base: regra["parcelado"],
        grupo: meio,
        titulo: `${o.parcelas}x de ${formatarMoeda(o.valorParcela)}`,
        detalhe: null,
        valorNegocio: valor("parcelado", reais(centavos(o.valorParcela) * o.parcelas)),
        descricao: `${ROTULO_MEIO_PARCELAMENTO[c.parcelado.meio]} em ${o.parcelas}x de ${formatarMoeda(o.valorParcela)}.`,
      });
    }
  }
  if (c.financiamento) {
    const inst = c.financiamento.instituicao;
    c.financiamento.opcoes.forEach((o, i) => {
      const entrada = o.entrada > 0 ? `entrada de ${formatarMoeda(o.entrada)}` : "sem entrada";
      opcoes.push({
        id: `financiamento:${i}`,
        modalidade: "financiamento",
      base: regra["financiamento"],
        grupo: inst ? `Financiamento · ${inst}` : "Financiamento",
        titulo: `${o.parcelas}x de ${formatarMoeda(o.valorParcela)}`,
        detalhe: `${entrada[0]!.toUpperCase()}${entrada.slice(1)} · carência de ${o.carenciaDias} dias`,
        valorNegocio: valor("financiamento", reais(centavos(o.entrada) + centavos(o.valorParcela) * o.parcelas)),
        descricao: `Financiamento${inst ? ` (${inst})` : ""}: ${entrada}, ${o.parcelas}x de ${formatarMoeda(o.valorParcela)}, carência de ${o.carenciaDias} dias.`,
      });
    });
  }
  if (c.personalizado) {
    const partes = c.personalizado.partes.map((x) => {
      const quando = x.momento === "data" && x.data ? `em ${dataBr(x.data)}` : ROTULO_MOMENTO[x.momento].toLowerCase();
      return `${formatarMoeda(x.valor)} (${ROTULO_FORMA[x.forma]}) ${quando}${x.observacao ? `, ${x.observacao}` : ""}`;
    });
    opcoes.push({
      id: "personalizado",
      modalidade: "personalizado",
      base: regra["personalizado"],
      grupo: "Personalizado",
      titulo: partes.join(" + "),
      detalhe: `Total de ${formatarMoeda(c.personalizado.total)}`,
      valorNegocio: valor("personalizado", c.personalizado.total),
      descricao: `${partes.join("; ")}. Total de ${formatarMoeda(c.personalizado.total)}.`,
    });
  }
  return opcoes;
}

/** O que fica gravado no contrato (`contratos.condicao_pagamento`): a opção, de qual emissão e a regra usada. */
export const esquemaCondicaoRegistrada = z.object({
  emissaoId: z.string().uuid(),
  versao: z.number().int().positive(),
  opcao: z.string().min(1).max(40),
  modalidade: z.enum(["aVista", "parcelado", "financiamento", "personalizado"]),
  descricao: z.string().min(1).max(1000),
  precoProposta: z.number().positive(),
  valorNegocio: z.number().positive(),
  base: z.enum(["preco", "total_cliente"]),
});
export type CondicaoRegistrada = z.infer<typeof esquemaCondicaoRegistrada>;

/** Lê a condição gravada no contrato; formato inesperado = nenhuma. */
export function lerCondicaoRegistrada(valor: unknown): CondicaoRegistrada | null {
  const lida = esquemaCondicaoRegistrada.safeParse(valor);
  return lida.success ? lida.data : null;
}
