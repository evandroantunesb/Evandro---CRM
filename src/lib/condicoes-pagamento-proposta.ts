import { z } from "zod";
import { MAX_PARCELAS, MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, type MeioParcelamento, type TaxaParcela } from "@/lib/condicoes-pagamento";
import { lerNumeroBr } from "@/lib/formatacao";

/**
 * Condições de pagamento na proposta (PR 3 do plano aprovado pelo Evandro em 01/11/2026): o que o vendedor escolhe na
 * emissão (à vista, parcelado, financiamento, Personalizado e observação), as regras conferidas no servidor e o que fica
 * congelado na versão emitida. A configuração da empresa (descontos, Personalizado, taxas) está em
 * `condicoes-pagamento.ts`. Funções puras: a tela usa as mesmas contas para as prévias.
 */

export const FORMAS_PERSONALIZADO = ["pix", "dinheiro", "transferencia", "cartao", "boleto"] as const;
export type FormaPersonalizado = (typeof FORMAS_PERSONALIZADO)[number];
export const ROTULO_FORMA: Record<FormaPersonalizado, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  cartao: "Cartão",
  boleto: "Boleto",
};

export const MOMENTOS_PERSONALIZADO = ["assinatura", "entrega_material", "fim_instalacao", "conexao", "data"] as const;
export type MomentoPersonalizado = (typeof MOMENTOS_PERSONALIZADO)[number];
export const ROTULO_MOMENTO: Record<MomentoPersonalizado, string> = {
  assinatura: "Na assinatura",
  entrega_material: "Na entrega do material",
  fim_instalacao: "No fim da instalação",
  conexao: "Na conexão",
  data: "Numa data",
};

export const CARENCIAS_FINANCIAMENTO = [30, 60, 90, 120, 150] as const;
export type CarenciaFinanciamento = (typeof CARENCIAS_FINANCIAMENTO)[number];

export const LIMITES_CONDICOES = {
  parcelasFinanciamento: 84,
  opcoesFinanciamento: 3,
  partesPersonalizado: 4,
  instituicao: 40,
  observacaoParte: 60,
  observacao: 240,
} as const;

export const MENSAGEM_NENHUMA_CONDICAO = "Marque pelo menos uma condição de pagamento.";
export const ORIENTACAO_APROVACAO = "Peça aprovação no cartão Desconto.";

/** O que a tela envia (JSON num campo escondido). Números como digitados ("1.234,56"); o servidor lê e confere tudo. */
export const esquemaEntradaCondicoes = z.object({
  // Desconto em % ou o valor à vista em R$ (o vendedor digita um dos dois; com `valor` preenchido, vale o valor).
  aVista: z.object({ desconto: z.string().max(20), valor: z.string().max(30).optional() }).nullable(),
  parcelado: z
    .object({ meio: z.enum(MEIOS_PARCELAMENTO), parcelas: z.array(z.number().int()).max(MAX_PARCELAS), repassarTaxas: z.boolean() })
    .nullable(),
  financiamento: z
    .object({
      instituicao: z.string().max(200),
      opcoes: z
        .array(z.object({ entrada: z.string().max(30), parcelas: z.string().max(10), valorParcela: z.string().max(30), carenciaDias: z.number().int() }))
        .max(10),
    })
    .nullable(),
  personalizado: z
    .object({
      partes: z
        .array(
          z.object({ valor: z.string().max(30), forma: z.string().max(20), momento: z.string().max(20), data: z.string().max(10), observacao: z.string().max(200) }),
        )
        .max(10),
    })
    .nullable(),
  observacao: z.string().max(2000),
});
export type EntradaCondicoes = z.infer<typeof esquemaEntradaCondicoes>;

/** O que a empresa permite a quem emite, lido no servidor no momento da emissão. */
export type RegrasCondicoes = {
  personalizadoAtivo: boolean;
  taxas: Record<MeioParcelamento, TaxaParcela[]>;
  /** Limite de quem emite (admin 100). */
  limiteDesconto: number;
  /** Maior desconto já aprovado neste negócio (0 = nenhum). */
  descontoAprovado: number;
  /** Preço sugerido pela tabela de preços (Compras P4b), se o negócio tem; ausente = sem sugerido. */
  precoSugerido?: number | null;
};

/** Desconto total que quem emite pode dar neste negócio (o limite dele ou o maior já aprovado). */
export const descontoPermitido = (r: Pick<RegrasCondicoes, "limiteDesconto" | "descontoAprovado">) => Math.max(r.limiteDesconto, r.descontoAprovado);

/*
 * Compras P4c (20261202100000_desconto_sobre_sugerido.sql; decisão do Evandro de 10/11/2026): o desconto é o preço
 * final que o cliente paga contra a referência do negócio, o maior entre o preço sugerido pela tabela e o preço do
 * negócio. Sem sugerido, a referência é o preço do negócio (como antes da P4c).
 */
type RegrasDesconto = Pick<RegrasCondicoes, "limiteDesconto" | "descontoAprovado" | "precoSugerido">;

export const referenciaDesconto = (preco: number, precoSugerido: number | null | undefined) => Math.max(preco, precoSugerido ?? 0);

/** Menor preço final, em centavos, que quem emite pode cobrar neste negócio sem aprovação nova. */
export const precoMinimoCentavos = (preco: number, r: RegrasDesconto) =>
  Math.round(referenciaDesconto(preco, r.precoSugerido) * (100 - descontoPermitido(r)));

/** O preço final passa do desconto permitido. */
export const passaDoPermitido = (precoFinal: number, preco: number, r: RegrasDesconto) => Math.round(precoFinal * 100) < precoMinimoCentavos(preco, r);

/** Desconto total (%) de um preço final, arredondado para cima: é o percentual a pedir para a aprovação cobrir. */
export const descontoTotal = (precoFinal: number, preco: number, r: Pick<RegrasCondicoes, "precoSugerido">) =>
  Math.max(0, descontoDoValor(referenciaDesconto(preco, r.precoSugerido), precoFinal));

/** Maior desconto à vista (% sobre o preço do negócio) que ainda cabe no permitido; 0 se o próprio preço já passa. */
export function descontoAVistaMaximo(preco: number, r: RegrasDesconto): number {
  if (preco <= 0) return 0;
  const folga = Math.round(preco * 100) - precoMinimoCentavos(preco, r);
  // Para baixo em 2 casas (o à vista com esse % ainda cabe), sem erro de ponto flutuante.
  return folga <= 0 ? 0 : Math.floor(Math.round((folga / (preco * 100)) * 1000000) / 100) / 100;
}

/**
 * À vista acima do permitido (a tela oferece pedir aprovação): o desconto total a pedir e o % à vista que ainda cabe.
 * Nulo = cabe no permitido, ou o próprio valor do negócio já passa (aí vale `pendenciaValorNegocio`).
 */
export function excessoAVista(preco: number, descontoAVista: number, r: RegrasDesconto): { pedir: number; maximoAVista: number } | null {
  if (pendenciaValorNegocio(preco, r)) return null;
  const final = valorAVista(preco, descontoAVista);
  if (!passaDoPermitido(final, preco, r) && descontoAVista <= descontoPermitido(r)) return null;
  return { pedir: descontoTotal(final, preco, r), maximoAVista: descontoAVistaMaximo(preco, r) };
}

/** Valor do negócio abaixo do sugerido além do permitido (nulo = dentro do permitido ou sem sugerido). */
export function pendenciaValorNegocio(preco: number, r: RegrasDesconto): string | null {
  if (!r.precoSugerido || !passaDoPermitido(preco, preco, r)) return null;
  return `O valor do negócio está ${formatarPercentual(descontoTotal(preco, preco, r))}% abaixo do preço sugerido (${formatarMoedaSimples(r.precoSugerido)}) e passa do permitido neste negócio (${formatarPercentual(descontoPermitido(r))}%). ${ORIENTACAO_APROVACAO}`;
}

const formatarMoedaSimples = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dinheiro = z.number().finite().positive();

/** Condições congeladas na versão emitida (`dados.comercial.condicoesPagamento`, esquema 5). */
export const esquemaCondicoesEmitidas = z
  .object({
    aVista: z.object({ descontoPercentual: z.number().min(0).lt(100), valor: dinheiro }).nullable(),
    parcelado: z
      .object({
        meio: z.enum(MEIOS_PARCELAMENTO),
        repassarTaxas: z.boolean(),
        opcoes: z
          .array(z.object({ parcelas: z.number().int().min(1).max(MAX_PARCELAS), taxaPercentual: z.number().min(0).lt(100), valorParcela: dinheiro }))
          .min(1)
          .max(MAX_PARCELAS),
      })
      .nullable(),
    financiamento: z
      .object({
        instituicao: z.string().min(1).max(LIMITES_CONDICOES.instituicao).nullable(),
        opcoes: z
          .array(
            z.object({
              entrada: z.number().finite().min(0),
              parcelas: z.number().int().min(1).max(LIMITES_CONDICOES.parcelasFinanciamento),
              valorParcela: dinheiro,
              carenciaDias: z.literal(CARENCIAS_FINANCIAMENTO),
            }),
          )
          .min(1)
          .max(LIMITES_CONDICOES.opcoesFinanciamento),
      })
      .nullable(),
    personalizado: z
      .object({
        partes: z
          .array(
            z.object({
              valor: dinheiro,
              forma: z.enum(FORMAS_PERSONALIZADO),
              momento: z.enum(MOMENTOS_PERSONALIZADO),
              data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
              observacao: z.string().min(1).max(LIMITES_CONDICOES.observacaoParte).nullable(),
            }),
          )
          .min(1)
          .max(LIMITES_CONDICOES.partesPersonalizado),
        total: dinheiro,
      })
      .nullable(),
    observacao: z.string().min(1).max(LIMITES_CONDICOES.observacao).nullable(),
  })
  .refine((c) => c.aVista || c.parcelado || c.financiamento || c.personalizado, MENSAGEM_NENHUMA_CONDICAO);
export type CondicoesEmitidas = z.infer<typeof esquemaCondicoesEmitidas>;

/** Centavos inteiros: as contas de dinheiro não acumulam erro de ponto flutuante. */
const centavos = (valor: number) => Math.round(valor * 100);
const emReais = (cents: number) => cents / 100;

/**
 * Parcela do parcelado, calculada pela tabela da empresa (o vendedor não digita). Com repasse, a empresa recebe o preço
 * cheio depois da taxa: preço ÷ (1 − taxa) ÷ parcelas; sem repasse, preço ÷ parcelas.
 */
export function valorParcela(preco: number, parcelas: number, taxaPercentual: number, repassarTaxas: boolean): number {
  const bruto = repassarTaxas ? preco / (1 - taxaPercentual / 100) : preco;
  return emReais(Math.round((bruto * 100) / parcelas));
}

/** Valor à vista com o desconto, em centavos arredondados. */
export const valorAVista = (preco: number, descontoPercentual: number) => emReais(Math.round(preco * (100 - descontoPercentual)));

/**
 * Desconto (%) de um valor à vista digitado em reais, arredondado PARA CIMA em 2 casas: é o percentual a pedir para
 * que a aprovação cubra o valor digitado.
 */
export const descontoDoValor = (preco: number, valor: number) => Math.ceil(Math.round((1 - valor / preco) * 1000000) / 100) / 100;

/** Desconto (%) que uma soma abaixo do preço representa, com 1 casa (só para exibir). */
export const descontoDaSoma = (preco: number, soma: number) => Math.round((1 - soma / preco) * 1000) / 10;

export const formatarPercentual = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

export type ResultadoCondicoes = { ok: true; condicoes: CondicoesEmitidas } | { ok: false; pendencias: string[] };

/**
 * Confere o que o vendedor escolheu contra as regras da empresa e monta as condições congeladas. Regras: ao menos uma
 * modalidade; desconto à vista e soma do Personalizado abaixo do preço até o desconto permitido (`descontoPermitido`);
 * parcelado só com parcelas configuradas e valores da tabela; financiamento digitado (até 84x, carência da lista);
 * Personalizado só se a empresa permitir.
 */
export function montarCondicoesPagamento(entrada: EntradaCondicoes, regras: RegrasCondicoes, preco: number, hoje: string): ResultadoCondicoes {
  const p: string[] = [];
  const L = LIMITES_CONDICOES;
  const maxDesconto = descontoPermitido(regras);
  const sobreSugerido = referenciaDesconto(preco, regras.precoSugerido) > preco ? " sobre o preço sugerido" : "";
  const passouDoLimite = (precoFinal: number) =>
    `Desconto de ${formatarPercentual(descontoTotal(precoFinal, preco, regras))}%${sobreSugerido} passa do permitido neste negócio (${formatarPercentual(maxDesconto)}%). ${ORIENTACAO_APROVACAO}`;
  // O próprio valor do negócio já passa do permitido (abaixo do sugerido): uma pendência só, sem repetir por condição.
  const pendenciaValor = pendenciaValorNegocio(preco, regras);
  if (pendenciaValor) p.push(pendenciaValor);
  const passa = (precoFinal: number) => !pendenciaValor && passaDoPermitido(precoFinal, preco, regras);

  let aVista: CondicoesEmitidas["aVista"] = null;
  if (entrada.aVista?.valor?.trim()) {
    // Valor à vista digitado em reais: grava o valor exato e o desconto que ele representa (2 casas, só para exibir).
    const v = lerNumeroBr(entrada.aVista.valor);
    if (v == null || !Number.isFinite(v) || centavos(v) <= 0 || centavos(v) > centavos(preco)) p.push("À vista: informe um valor maior que zero e até o preço.");
    else if (passa(v)) p.push(passouDoLimite(v));
    else aVista = { descontoPercentual: Math.round((1 - centavos(v) / centavos(preco)) * 10000) / 100, valor: emReais(centavos(v)) };
  } else if (entrada.aVista) {
    const d = lerNumeroBr(entrada.aVista.desconto) ?? 0;
    if (!Number.isFinite(d) || d < 0 || d >= 100) p.push("À vista: informe um desconto de 0 a 99,99%.");
    else {
      const desconto = Math.round(d * 100) / 100;
      const v = valorAVista(preco, desconto);
      if (passa(v) || (!pendenciaValor && desconto > maxDesconto)) p.push(passouDoLimite(v));
      else aVista = { descontoPercentual: desconto, valor: v };
    }
  }

  let parcelado: CondicoesEmitidas["parcelado"] = null;
  if (entrada.parcelado) {
    const { meio, repassarTaxas } = entrada.parcelado;
    const tabela = new Map(regras.taxas[meio].map((t) => [t.parcelas, t.taxa]));
    const escolhidas = [...new Set(entrada.parcelado.parcelas)].sort((a, b) => a - b);
    const nomeMeio = ROTULO_MEIO_PARCELAMENTO[meio].toLowerCase();
    if (tabela.size === 0) p.push(`Parcelado: a empresa não oferece parcelas no ${nomeMeio}.`);
    else if (escolhidas.length === 0) p.push("Parcelado: marque pelo menos uma parcela para mostrar.");
    else if (escolhidas.some((n) => !tabela.has(n))) p.push(`Parcelado: há parcela que a empresa não oferece no ${nomeMeio}.`);
    else {
      parcelado = {
        meio,
        repassarTaxas,
        opcoes: escolhidas.map((n) => ({ parcelas: n, taxaPercentual: tabela.get(n)!, valorParcela: valorParcela(preco, n, tabela.get(n)!, repassarTaxas) })),
      };
    }
  }

  let financiamento: CondicoesEmitidas["financiamento"] = null;
  if (entrada.financiamento) {
    const antes = p.length;
    const instituicao = entrada.financiamento.instituicao.trim();
    const opcoes = entrada.financiamento.opcoes;
    if (instituicao.length > L.instituicao) p.push(`Financiamento: a instituição passa de ${L.instituicao} caracteres.`);
    if (opcoes.length === 0) p.push("Financiamento: preencha pelo menos uma opção.");
    if (opcoes.length > L.opcoesFinanciamento) p.push(`Financiamento: até ${L.opcoesFinanciamento} opções.`);
    const lidas = opcoes.map((o, i) => {
      const n = `Financiamento, opção ${i + 1}`;
      const valorEntrada = lerNumeroBr(o.entrada) ?? 0;
      const parcelas = Number(o.parcelas.trim() || Number.NaN);
      const parcela = lerNumeroBr(o.valorParcela);
      if (!Number.isFinite(valorEntrada) || valorEntrada < 0 || centavos(valorEntrada) >= centavos(preco)) p.push(`${n}: a entrada precisa ser menor que o preço.`);
      if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > L.parcelasFinanciamento) p.push(`${n}: parcelas de 1 a ${L.parcelasFinanciamento}.`);
      if (parcela == null || !Number.isFinite(parcela) || centavos(parcela) <= 0) p.push(`${n}: informe o valor da parcela.`);
      if (!(CARENCIAS_FINANCIAMENTO as readonly number[]).includes(o.carenciaDias)) p.push(`${n}: escolha a carência.`);
      return { entrada: emReais(centavos(valorEntrada)), parcelas, valorParcela: emReais(centavos(parcela ?? 0)), carenciaDias: o.carenciaDias as CarenciaFinanciamento };
    });
    if (p.length === antes) financiamento = { instituicao: instituicao || null, opcoes: lidas };
  }

  let personalizado: CondicoesEmitidas["personalizado"] = null;
  if (entrada.personalizado) {
    const antes = p.length;
    const partes = entrada.personalizado.partes;
    if (!regras.personalizadoAtivo) p.push("A empresa não oferece a condição Personalizado.");
    else {
      if (partes.length === 0) p.push("Personalizado: adicione pelo menos uma parte.");
      if (partes.length > L.partesPersonalizado) p.push(`Personalizado: até ${L.partesPersonalizado} partes.`);
      const lidas = partes.map((parte, i) => {
        const n = `Personalizado, parte ${i + 1}`;
        const valor = lerNumeroBr(parte.valor);
        const forma = (FORMAS_PERSONALIZADO as readonly string[]).includes(parte.forma) ? (parte.forma as FormaPersonalizado) : null;
        const momento = (MOMENTOS_PERSONALIZADO as readonly string[]).includes(parte.momento) ? (parte.momento as MomentoPersonalizado) : null;
        const observacao = parte.observacao.trim();
        if (valor == null || !Number.isFinite(valor) || centavos(valor) <= 0) p.push(`${n}: informe um valor maior que zero.`);
        if (!forma) p.push(`${n}: escolha a forma de pagamento.`);
        if (!momento) p.push(`${n}: escolha quando é pago.`);
        if (momento === "data" && !(dataValida(parte.data) && parte.data >= hoje)) p.push(`${n}: escolha uma data a partir de hoje.`);
        if (observacao.length > L.observacaoParte) p.push(`${n}: a observação passa de ${L.observacaoParte} caracteres.`);
        return {
          valor: emReais(centavos(valor ?? 0)),
          forma: forma ?? "pix",
          momento: momento ?? "assinatura",
          data: momento === "data" ? parte.data : null,
          observacao: observacao || null,
        };
      });
      const total = lidas.reduce((s, x) => s + centavos(x.valor), 0);
      // Soma abaixo do preço é desconto: vale o mesmo limite do à vista (em centavos).
      if (p.length === antes && passa(emReais(total))) p.push(passouDoLimite(emReais(total)));
      if (p.length === antes) personalizado = { partes: lidas, total: emReais(total) };
    }
  }

  const observacao = entrada.observacao.trim();
  if (observacao.length > L.observacao) p.push(`A observação das condições passa de ${L.observacao} caracteres. Resuma o texto.`);
  if (!entrada.aVista && !entrada.parcelado && !entrada.financiamento && !entrada.personalizado) p.push(MENSAGEM_NENHUMA_CONDICAO);
  if (p.length) return { ok: false, pendencias: p };

  const analisado = esquemaCondicoesEmitidas.safeParse({ aVista, parcelado, financiamento, personalizado, observacao: observacao || null });
  if (!analisado.success) return { ok: false, pendencias: ["As condições de pagamento não passaram na conferência. Revise os valores."] };
  return { ok: true, condicoes: analisado.data };
}
