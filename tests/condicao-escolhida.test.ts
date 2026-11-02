import { describe, expect, it } from "vitest";
import { opcoesDeEscolha } from "@/lib/condicao-escolhida";
import { VALOR_NEGOCIO_PADRAO, valorNegocioDaEmpresa } from "@/lib/condicoes-pagamento";
import type { CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";

const PRECO = 30000;
const R = (v: string) => `R$ ${v}`;
const CONDICOES: CondicoesEmitidas = {
  aVista: { descontoPercentual: 5, valor: 28500 },
  parcelado: { meio: "cartao", repassarTaxas: true, opcoes: [{ parcelas: 10, taxaPercentual: 10.12, valorParcela: 3337.78 }] },
  financiamento: { instituicao: "Banco X", opcoes: [{ entrada: 1000, parcelas: 60, valorParcela: 690, carenciaDias: 90 }] },
  personalizado: {
    partes: [
      { valor: 10000, forma: "pix", momento: "assinatura", data: null, observacao: null },
      { valor: 15000, forma: "dinheiro", momento: "data", data: "2026-12-01", observacao: "sinal" },
    ],
    total: 25000,
  },
  observacao: null,
};

describe("opções da condição escolhida", () => {
  it("uma opção por à vista, por parcela, por financiamento e o Personalizado, com o texto do contrato", () => {
    const opcoes = opcoesDeEscolha(CONDICOES, PRECO, VALOR_NEGOCIO_PADRAO);
    expect(opcoes.map((o) => [o.id, o.grupo, o.titulo, o.descricao])).toEqual([
      ["aVista", "À vista", R("28.500,00"), `À vista: ${R("28.500,00")} (5% de desconto).`],
      ["parcelado:10", "Cartão de crédito", `10x de ${R("3.337,78")}`, `Cartão em 10x de ${R("3.337,78")}.`],
      [
        "financiamento:0",
        "Financiamento · Banco X",
        `60x de ${R("690,00")}`,
        `Financiamento (Banco X): entrada de ${R("1.000,00")}, 60x de ${R("690,00")}, carência de 90 dias.`,
      ],
      [
        "personalizado",
        "Personalizado",
        `${R("10.000,00")} (PIX) na assinatura + ${R("15.000,00")} (Dinheiro) em 01/12/2026, sinal`,
        `${R("10.000,00")} (PIX) na assinatura; ${R("15.000,00")} (Dinheiro) em 01/12/2026, sinal. Total de ${R("25.000,00")}.`,
      ],
    ]);
  });

  it("padrão: à vista e Personalizado mudam o valor; parcelado e financiamento ficam no preço", () => {
    const valores = opcoesDeEscolha(CONDICOES, PRECO, VALOR_NEGOCIO_PADRAO).map((o) => [o.id, o.valorNegocio, o.base]);
    expect(valores).toEqual([
      ["aVista", 28500, "total_cliente"],
      ["parcelado:10", 30000, "preco"],
      ["financiamento:0", 30000, "preco"],
      ["personalizado", 25000, "total_cliente"],
    ]);
  });

  it("total pago pelo cliente: parcelas somadas e entrada + parcelas, em centavos", () => {
    const regra = { aVista: "preco", parcelado: "total_cliente", financiamento: "total_cliente", personalizado: "preco" } as const;
    expect(opcoesDeEscolha(CONDICOES, PRECO, regra).map((o) => o.valorNegocio)).toEqual([30000, 33377.8, 42400, 30000]);
  });

  it("sem configuração gravada, vale o padrão; valor desconhecido também cai no padrão", () => {
    expect(valorNegocioDaEmpresa(null)).toEqual(VALOR_NEGOCIO_PADRAO);
    expect(
      valorNegocioDaEmpresa({ valor_negocio_avista: "preco", valor_negocio_parcelado: "x", valor_negocio_financiamento: "total_cliente", valor_negocio_personalizado: "preco" }),
    ).toEqual({ aVista: "preco", parcelado: "preco", financiamento: "total_cliente", personalizado: "preco" });
  });
});
