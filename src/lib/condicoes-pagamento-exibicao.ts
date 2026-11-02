import { ROTULO_MEIO_PARCELAMENTO } from "@/lib/condicoes-pagamento";
import { ROTULO_FORMA, ROTULO_MOMENTO, formatarPercentual, type CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda } from "@/lib/formatacao";

/**
 * Como o cliente vê as condições de pagamento emitidas (esquema 5): em linhas de texto e organizadas por modalidade
 * (PDF e página da proposta). Funções puras.
 */

const moeda = formatarMoeda;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * As condições emitidas em linhas de texto, uma por modalidade (e a observação por último). Usado pelo PDF e pela
 * página do cliente até o bloco organizado por modalidade (PR 3b).
 */
export function linhasCondicoesEmitidas(c: CondicoesEmitidas): string[] {
  const linhas: string[] = [];
  if (c.aVista) {
    linhas.push(`À vista: ${moeda(c.aVista.valor)}${c.aVista.descontoPercentual > 0 ? ` (${formatarPercentual(c.aVista.descontoPercentual)}% de desconto)` : ""}`);
  }
  if (c.parcelado) {
    linhas.push(`${ROTULO_MEIO_PARCELAMENTO[c.parcelado.meio]}: ${c.parcelado.opcoes.map((o) => `${o.parcelas}x de ${moeda(o.valorParcela)}`).join(" · ")}`);
  }
  if (c.financiamento) {
    const titulo = c.financiamento.instituicao ? `Financiamento (${c.financiamento.instituicao})` : "Financiamento";
    for (const o of c.financiamento.opcoes) {
      const entrada = o.entrada > 0 ? `entrada de ${moeda(o.entrada)} + ` : "";
      linhas.push(`${titulo}: ${entrada}${o.parcelas}x de ${moeda(o.valorParcela)}, carência de ${o.carenciaDias} dias`);
    }
  }
  if (c.personalizado) {
    const partes = c.personalizado.partes.map((x) => {
      const quando = x.momento === "data" && x.data ? `em ${dataBr(x.data)}` : ROTULO_MOMENTO[x.momento].toLowerCase();
      return `${moeda(x.valor)} (${ROTULO_FORMA[x.forma]}) ${quando}${x.observacao ? ` — ${x.observacao}` : ""}`;
    });
    linhas.push(`Personalizado, total de ${moeda(c.personalizado.total)}: ${partes.join("; ")}`);
  }
  if (c.observacao) linhas.push(c.observacao);
  return linhas;
}

/** Uma modalidade como o cliente vê (PDF e página): título, linha de apoio e as opções. */
export type SecaoCondicao = {
  modalidade: "aVista" | "parcelado" | "financiamento" | "personalizado";
  titulo: string;
  subtitulo: string | null;
  itens: { valor: string; detalhe: string | null }[];
};

/** As condições emitidas organizadas por modalidade, na ordem da tela (a observação fica à parte). */
export function secoesCondicoesEmitidas(c: CondicoesEmitidas): SecaoCondicao[] {
  const secoes: SecaoCondicao[] = [];
  if (c.aVista) {
    secoes.push({
      modalidade: "aVista",
      titulo: "À vista",
      subtitulo: c.aVista.descontoPercentual > 0 ? `${formatarPercentual(c.aVista.descontoPercentual)}% de desconto` : null,
      itens: [{ valor: moeda(c.aVista.valor), detalhe: null }],
    });
  }
  if (c.parcelado) {
    secoes.push({
      modalidade: "parcelado",
      titulo: c.parcelado.meio === "cartao" ? "Cartão de crédito" : "Boleto parcelado",
      subtitulo: null,
      itens: c.parcelado.opcoes.map((o) => ({ valor: `${o.parcelas}x de ${moeda(o.valorParcela)}`, detalhe: null })),
    });
  }
  if (c.financiamento) {
    secoes.push({
      modalidade: "financiamento",
      titulo: "Financiamento",
      subtitulo: c.financiamento.instituicao,
      itens: c.financiamento.opcoes.map((o) => ({
        valor: `${o.parcelas}x de ${moeda(o.valorParcela)}`,
        detalhe: `${o.entrada > 0 ? `Entrada de ${moeda(o.entrada)}` : "Sem entrada"} · carência de ${o.carenciaDias} dias`,
      })),
    });
  }
  if (c.personalizado) {
    secoes.push({
      modalidade: "personalizado",
      titulo: "Personalizado",
      subtitulo: `Total de ${moeda(c.personalizado.total)}`,
      itens: c.personalizado.partes.map((x) => ({
        valor: `${moeda(x.valor)} · ${ROTULO_FORMA[x.forma]}`,
        detalhe: [x.momento === "data" && x.data ? `Em ${dataBr(x.data)}` : ROTULO_MOMENTO[x.momento], x.observacao].filter(Boolean).join(" — "),
      })),
    });
  }
  return secoes;
}
