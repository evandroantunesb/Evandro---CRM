/**
 * Eletroposto (carregador veicular DC de 80 kW, duas saídas): catálogo fixo de três modelos e a simulação
 * comercial ilustrativa da proposta. Tudo aqui reproduz o modelo de proposta da IBS
 * (`proposta_carregador_veicular_ibs_branco.html`, objeto `CFG`) e o gerador independente
 * (`IBS_Eletropostos_Standalone.html`, objeto `PRODUCTS`): preços, premissas e fórmulas são dados de produto
 * aprovados pelo Evandro — não altere sem pedido dele.
 *
 * Os números da simulação são um cenário de referência, iguais para todo cliente: não são calculados a
 * partir do perfil do cliente e não são promessa de resultado (a proposta diz isso em cada página).
 */

export const MODELOS_ELETROPOSTO = ["basic", "full", "screen"] as const;
export type ModeloEletroposto = (typeof MODELOS_ELETROPOSTO)[number];

type ItemCatalogo = {
  nome: string;
  /** Subtítulo do modelo na proposta (tabela "O que cada produto inclui" e investimento). */
  tag: string;
  /** Preço à vista em reais. Cada modelo é uma alternativa: preços nunca se somam. */
  preco: number;
  /** Soma as receitas estimadas da tela e do ecossistema ao resultado (só o Full Screen). */
  receitaEcossistema: boolean;
  /** O que o modelo inclui, nos cartões de escolha do cadastro. */
  itens: readonly string[];
};

export const CATALOGO_ELETROPOSTO: Record<ModeloEletroposto, ItemCatalogo> = {
  basic: {
    nome: "IBS Basic",
    tag: "Porta de entrada",
    preco: 99900,
    receitaEcossistema: false,
    itens: ["Carregador de 80 kW homologado e instalado", "Software IBS para cobrança e pagamento", "Assistência técnica e peças de reposição", "Acesso ao Pacote Fidelidade"],
  },
  full: {
    nome: "IBS Full",
    tag: "Chave na mão",
    preco: 119900,
    receitaEcossistema: false,
    itens: ["Tudo do IBS Basic", "Projeto, ART e trâmites da concessionária", "Padrão de entrada de energia homologado", "Instalação, ativação e operação", "Repasse financeiro conciliado"],
  },
  screen: {
    nome: "IBS Full Screen",
    tag: "Chave na mão com tela",
    preco: 149900,
    receitaEcossistema: true,
    itens: ["Tudo do IBS Full", "Tela de mídia integrada", "Potencial de receitas do ecossistema IBS", "Energia compartilhada e comissão em usinas"],
  },
};

/** Premissas fixas do cenário de referência (as mesmas da apresentação comercial da IBS). */
export const PREMISSAS_ELETROPOSTO = {
  potenciaKw: 80,
  pontosRecarga: 2,
  /** Energia vendida por mês no cenário realista. */
  kwhMes: 7000,
  kwhPorRecarga: 50,
  /** Preço de venda ao motorista (R$/kWh). */
  vendaKwh: 1.8,
  /** Tarifa de referência da concessionária (R$/kWh). */
  tarifaKwh: 1.05,
  /** Parcela da tarifa referente ao uso da rede (R$/kWh), sem desconto. */
  redeKwh: 0.22,
  /** Desconto do Pacote Fidelidade usado no cenário (%). */
  descontoPct: 20,
  /** Receitas estimadas da tela e do ecossistema IBS por kWh vendido (só Full Screen). */
  ecossistemaKwh: 0.4075,
  /** Faixas de desconto do Pacote Fidelidade (%). */
  faixasFidelidade: [20, 22, 25, 30] as const,
  validadeDias: 7,
} as const;

/** Margem por kWh vendido, depois do custo da energia (com o desconto) e do uso da rede. */
export function margemPorKwh(descontoPct: number = PREMISSAS_ELETROPOSTO.descontoPct): number {
  const { vendaKwh, tarifaKwh, redeKwh } = PREMISSAS_ELETROPOSTO;
  return vendaKwh - (tarifaKwh - redeKwh) * (1 - descontoPct / 100) - redeKwh;
}

/** Cenário mensal comum aos três modelos: faturamento, custo de energia e rede, resultado e recargas. */
export function cenarioMensal() {
  const { kwhMes, vendaKwh, kwhPorRecarga } = PREMISSAS_ELETROPOSTO;
  const faturamento = kwhMes * vendaKwh;
  const resultado = kwhMes * margemPorKwh();
  return { faturamento, custo: faturamento - resultado, resultado, recargas: Math.round(kwhMes / kwhPorRecarga) };
}

/** Receitas estimadas da tela e do ecossistema por mês (zero fora do Full Screen). */
export function receitaEcossistemaMensal(modelo: ModeloEletroposto): number {
  return CATALOGO_ELETROPOSTO[modelo].receitaEcossistema ? PREMISSAS_ELETROPOSTO.kwhMes * PREMISSAS_ELETROPOSTO.ecossistemaKwh : 0;
}

/** Meses para o modelo se pagar no cenário (arredondado para cima); nulo se o resultado não for positivo. */
export function paybackMeses(modelo: ModeloEletroposto, preco: number = CATALOGO_ELETROPOSTO[modelo].preco): number | null {
  const resultado = cenarioMensal().resultado + receitaEcossistemaMensal(modelo);
  if (!(resultado > 0)) return null;
  return Math.ceil(preco / resultado);
}

export function ehModeloEletroposto(v: unknown): v is ModeloEletroposto {
  return typeof v === "string" && (MODELOS_ELETROPOSTO as readonly string[]).includes(v);
}

/** Modelos sem repetição, na ordem do catálogo (Basic, Full, Full Screen). */
export function normalizarModelos(modelos: readonly unknown[]): ModeloEletroposto[] {
  return MODELOS_ELETROPOSTO.filter((m) => modelos.includes(m));
}

/** Preços congelados no momento da proposta: um por modelo escolhido, sempre do catálogo. */
export function precosDoCatalogo(modelos: readonly ModeloEletroposto[]): Partial<Record<ModeloEletroposto, number>> {
  return Object.fromEntries(modelos.map((m) => [m, CATALOGO_ELETROPOSTO[m].preco]));
}

/** Celular brasileiro com DDD (11 dígitos, nono dígito 9), como no gerador da IBS. */
export function whatsappValido(valor: string): boolean {
  return /^\d{2}9\d{8}$/.test(valor.replace(/\D/g, ""));
}

/** Máscara do WhatsApp enquanto digita: (45) 99999-9999. */
export function mascararWhatsapp(valor: string): string {
  const n = valor.replace(/\D/g, "").slice(0, 11);
  if (!n) return "";
  if (n.length <= 2) return `(${n}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}${n.length > 7 ? `-${n.slice(7)}` : ""}`;
}

/** Número exibido da proposta: EV- e o número do negócio (único por empresa). */
export function numeroPropostaEletroposto(numeroNegocio: number): string {
  return `EV-${String(numeroNegocio).padStart(4, "0")}`;
}
