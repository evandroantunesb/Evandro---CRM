import { describe, expect, it } from "vitest";
import {
  MENSAGEM_NENHUMA_CONDICAO,
  ORIENTACAO_APROVACAO,
  descontoDoValor,
  montarCondicoesPagamento,
  valorParcela,
  type EntradaCondicoes,
  type RegrasCondicoes,
} from "@/lib/condicoes-pagamento-proposta";
import { linhasCondicoesEmitidas, secoesCondicoesEmitidas } from "@/lib/condicoes-pagamento-exibicao";

const PRECO = 30000;
const HOJE = "2026-11-02";
const REGRAS: RegrasCondicoes = {
  personalizadoAtivo: true,
  taxas: {
    cartao: [
      { parcelas: 1, taxa: 3 },
      { parcelas: 3, taxa: 5 },
      { parcelas: 10, taxa: 10.12 },
    ],
    boleto: [],
  },
  limiteDesconto: 5,
  descontoAprovado: 0,
};
const VAZIA: EntradaCondicoes = { aVista: null, parcelado: null, financiamento: null, personalizado: null, observacao: "" };

const montar = (entrada: Partial<EntradaCondicoes>, regras: Partial<RegrasCondicoes> = {}) =>
  montarCondicoesPagamento({ ...VAZIA, ...entrada }, { ...REGRAS, ...regras }, PRECO, HOJE);

function pendencias(r: ReturnType<typeof montar>) {
  return r.ok ? [] : r.pendencias;
}

describe("modalidades", () => {
  it("exige pelo menos uma modalidade (a observação sozinha não basta)", () => {
    expect(pendencias(montar({ observacao: "Combinar com o vendedor" }))).toEqual([MENSAGEM_NENHUMA_CONDICAO]);
  });

  it("à vista: valor com o desconto em centavos", () => {
    const r = montar({ aVista: { desconto: "5" } });
    expect(r.ok && r.condicoes.aVista).toEqual({ descontoPercentual: 5, valor: 28500 });
    const quebrado = montar({ aVista: { desconto: "4,75" } });
    expect(quebrado.ok && quebrado.condicoes.aVista).toEqual({ descontoPercentual: 4.75, valor: 28575 });
  });

  it("parcelado: o servidor calcula a parcela pela tabela, com e sem repasse da taxa", () => {
    expect(valorParcela(PRECO, 1, 3, true)).toBe(30927.84); // 30.000 ÷ 0,97
    expect(valorParcela(PRECO, 3, 5, true)).toBe(10526.32); // 30.000 ÷ 0,95 ÷ 3
    expect(valorParcela(PRECO, 3, 5, false)).toBe(10000);
    const r = montar({ parcelado: { meio: "cartao", parcelas: [10, 1, 1], repassarTaxas: true } });
    expect(r.ok && r.condicoes.parcelado).toEqual({
      meio: "cartao",
      repassarTaxas: true,
      opcoes: [
        { parcelas: 1, taxaPercentual: 3, valorParcela: 30927.84 },
        { parcelas: 10, taxaPercentual: 10.12, valorParcela: 3337.78 },
      ],
    });
  });

  it("parcelado: recusa parcela não configurada, meio sem tabela e nenhuma parcela marcada", () => {
    expect(montar({ parcelado: { meio: "cartao", parcelas: [12], repassarTaxas: false } }).ok).toBe(false);
    expect(montar({ parcelado: { meio: "boleto", parcelas: [1], repassarTaxas: false } }).ok).toBe(false);
    expect(montar({ parcelado: { meio: "cartao", parcelas: [], repassarTaxas: false } }).ok).toBe(false);
  });

  it("financiamento: valores digitados, entrada opcional, até 84x e carência da lista", () => {
    const opcao = { entrada: "", parcelas: "60", valorParcela: "690,00", carenciaDias: 90 };
    const r = montar({ financiamento: { instituicao: " Banco X ", opcoes: [opcao, { ...opcao, entrada: "1.000", parcelas: "84", valorParcela: "560" }] } });
    expect(r.ok && r.condicoes.financiamento).toEqual({
      instituicao: "Banco X",
      opcoes: [
        { entrada: 0, parcelas: 60, valorParcela: 690, carenciaDias: 90 },
        { entrada: 1000, parcelas: 84, valorParcela: 560, carenciaDias: 90 },
      ],
    });
    const semInstituicao = montar({ financiamento: { instituicao: "", opcoes: [opcao] } });
    expect(semInstituicao.ok && semInstituicao.condicoes.financiamento?.instituicao).toBeNull();
    for (const ruim of [
      { parcelas: "85" },
      { parcelas: "0" },
      { parcelas: "12,5" },
      { valorParcela: "" },
      { valorParcela: "1.2" },
      { carenciaDias: 45 },
      { entrada: "30.000" },
    ]) {
      expect(montar({ financiamento: { instituicao: "", opcoes: [{ ...opcao, ...ruim }] } }).ok, JSON.stringify(ruim)).toBe(false);
    }
    expect(montar({ financiamento: { instituicao: "", opcoes: [] } }).ok).toBe(false);
    expect(montar({ financiamento: { instituicao: "", opcoes: Array.from({ length: 4 }, () => opcao) } }).ok).toBe(false);
  });

  it("personalizado: partes com valor, forma e momento; data só no momento 'data' e a partir de hoje", () => {
    const partes = [
      { valor: "10.000", forma: "pix", momento: "assinatura", data: "2026-12-01", observacao: "" },
      { valor: "20.000", forma: "dinheiro", momento: "data", data: "2026-12-01", observacao: " sinal " },
    ];
    const r = montar({ personalizado: { partes } });
    expect(r.ok && r.condicoes.personalizado).toEqual({
      partes: [
        { valor: 10000, forma: "pix", momento: "assinatura", data: null, observacao: null },
        { valor: 20000, forma: "dinheiro", momento: "data", data: "2026-12-01", observacao: "sinal" },
      ],
      total: 30000,
    });
    for (const ruim of [{ valor: "0" }, { forma: "cheque" }, { momento: "quando der" }, { momento: "data", data: "2026-11-01" }, { momento: "data", data: "" }]) {
      expect(montar({ personalizado: { partes: [{ ...partes[0]!, ...ruim }, partes[1]!] } }).ok, JSON.stringify(ruim)).toBe(false);
    }
    expect(montar({ personalizado: { partes } }, { personalizadoAtivo: false }).ok).toBe(false);
  });
});

describe("à vista: o vendedor digita o desconto em % ou o valor em R$", () => {
  it("valor digitado vale exato; o desconto é calculado (2 casas)", () => {
    const r = montar({ aVista: { desconto: "5,56", valor: "28.333,00" } }, { descontoAprovado: 6 });
    expect(r.ok && r.condicoes.aVista).toEqual({ descontoPercentual: 5.56, valor: 28333 });
    const redondo = montar({ aVista: { desconto: "", valor: "28.500" } });
    expect(redondo.ok && redondo.condicoes.aVista).toEqual({ descontoPercentual: 5, valor: 28500 });
  });

  it("o % para pedir aprovação arredonda para cima, para cobrir o valor digitado", () => {
    expect(descontoDoValor(PRECO, 28500)).toBe(5);
    expect(descontoDoValor(PRECO, 28333)).toBe(5.56); // 5,5567%
    expect(descontoDoValor(PRECO, 27000)).toBe(10);
  });

  it("valor abaixo do permitido bloqueia com a orientação; acima do preço, zero ou fora do padrão é recusado", () => {
    expect(pendencias(montar({ aVista: { desconto: "", valor: "28.499,99" } })).join(" ")).toContain(ORIENTACAO_APROVACAO);
    expect(montar({ aVista: { desconto: "", valor: "28.499,99" } }, { descontoAprovado: 5.01 }).ok).toBe(true);
    for (const ruim of ["30.000,01", "0", "28.500.00", "abc"]) expect(montar({ aVista: { desconto: "", valor: ruim } }).ok, ruim).toBe(false);
  });

  it("sem valor digitado, vale o %", () => {
    const r = montar({ aVista: { desconto: "4,75", valor: "" } });
    expect(r.ok && r.condicoes.aVista).toEqual({ descontoPercentual: 4.75, valor: 28575 });
  });
});

describe("desconto: limite de quem emite ou o maior aprovado no negócio", () => {
  it("à vista acima do permitido bloqueia com a orientação de pedir aprovação", () => {
    const r = montar({ aVista: { desconto: "8" } });
    expect(r.ok).toBe(false);
    expect(pendencias(r).join(" ")).toContain(ORIENTACAO_APROVACAO);
  });

  it("vale o maior entre o próprio limite e o aprovado no negócio", () => {
    expect(montar({ aVista: { desconto: "8" } }, { descontoAprovado: 8 }).ok).toBe(true);
    expect(montar({ aVista: { desconto: "8,01" } }, { descontoAprovado: 8 }).ok).toBe(false);
    expect(montar({ aVista: { desconto: "5" } }, { limiteDesconto: 5, descontoAprovado: 2 }).ok).toBe(true);
  });

  it("personalizado abaixo do preço conta como desconto; igual ou acima do preço passa", () => {
    const parte = (valor: string) => ({ valor, forma: "pix", momento: "assinatura", data: "", observacao: "" });
    // 25.000 de 30.000 = 16,7% de desconto
    const r = montar({ personalizado: { partes: [parte("10.000"), parte("15.000")] } });
    expect(pendencias(r).join(" ")).toContain("16,7%");
    expect(pendencias(r).join(" ")).toContain(ORIENTACAO_APROVACAO);
    expect(montar({ personalizado: { partes: [parte("28.500")] } }).ok).toBe(true); // exatamente 5%
    expect(montar({ personalizado: { partes: [parte("28.499,99")] } }).ok).toBe(false);
    expect(montar({ personalizado: { partes: [parte("31.000")] } }).ok).toBe(true);
    expect(montar({ personalizado: { partes: [parte("10.000"), parte("15.000")] } }, { descontoAprovado: 17 }).ok).toBe(true);
  });
});

describe("texto das condições emitidas (PDF e página até a PR 3b)", () => {
  it("uma linha por modalidade e a observação por último", () => {
    const r = montar({
      aVista: { desconto: "5" },
      parcelado: { meio: "cartao", parcelas: [1, 3], repassarTaxas: false },
      financiamento: { instituicao: "Banco X", opcoes: [{ entrada: "1.000", parcelas: "60", valorParcela: "690", carenciaDias: 90 }] },
      personalizado: { partes: [{ valor: "30.000", forma: "pix", momento: "data", data: "2026-12-01", observacao: "" }] },
      observacao: "Valores válidos até a validade",
    });
    if (!r.ok) throw new Error(r.pendencias.join(" "));
    const nbsp = " ";
    expect(linhasCondicoesEmitidas(r.condicoes)).toEqual([
      `À vista: R$${nbsp}28.500,00 (5% de desconto)`,
      `Cartão: 1x de R$${nbsp}30.000,00 · 3x de R$${nbsp}10.000,00`,
      `Financiamento (Banco X): entrada de R$${nbsp}1.000,00 + 60x de R$${nbsp}690,00, carência de 90 dias`,
      `Personalizado, total de R$${nbsp}30.000,00: R$${nbsp}30.000,00 (PIX) em 01/12/2026`,
      "Valores válidos até a validade",
    ]);
  });
});

describe("condições por modalidade (PDF e página, PR 3b)", () => {
  it("uma seção por modalidade marcada, na ordem da tela, com títulos e opções prontos para exibir", () => {
    const r = montar({
      aVista: { desconto: "5" },
      parcelado: { meio: "cartao", parcelas: [1, 3], repassarTaxas: false },
      financiamento: { instituicao: "", opcoes: [{ entrada: "", parcelas: "60", valorParcela: "690", carenciaDias: 90 }] },
      personalizado: { partes: [{ valor: "30.000", forma: "transferencia", momento: "conexao", data: "", observacao: "após a vistoria" }] },
    });
    if (!r.ok) throw new Error(r.pendencias.join(" "));
    const nbsp = " ";
    expect(secoesCondicoesEmitidas(r.condicoes)).toEqual([
      { modalidade: "aVista", titulo: "À vista", subtitulo: "5% de desconto", itens: [{ valor: `R$${nbsp}28.500,00`, detalhe: null }] },
      {
        modalidade: "parcelado",
        titulo: "Cartão de crédito",
        subtitulo: null,
        itens: [
          { valor: `1x de R$${nbsp}30.000,00`, detalhe: null },
          { valor: `3x de R$${nbsp}10.000,00`, detalhe: null },
        ],
      },
      {
        modalidade: "financiamento",
        titulo: "Financiamento",
        subtitulo: null,
        itens: [{ valor: `60x de R$${nbsp}690,00`, detalhe: "Sem entrada · carência de 90 dias" }],
      },
      {
        modalidade: "personalizado",
        titulo: "Personalizado",
        subtitulo: `Total de R$${nbsp}30.000,00`,
        itens: [{ valor: `R$${nbsp}30.000,00 · Transferência`, detalhe: "Na conexão — após a vistoria" }],
      },
    ]);
  });

  it("modalidade não marcada não aparece; à vista sem desconto fica sem linha de apoio", () => {
    const r = montar({ aVista: { desconto: "0" } });
    if (!r.ok) throw new Error(r.pendencias.join(" "));
    expect(secoesCondicoesEmitidas(r.condicoes)).toEqual([
      { modalidade: "aVista", titulo: "À vista", subtitulo: null, itens: [{ valor: "R$ 30.000,00", detalhe: null }] },
    ]);
  });
});
