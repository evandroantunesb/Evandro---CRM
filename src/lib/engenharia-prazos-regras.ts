/**
 * Prazos da Engenharia (P5), decididos pelo Evandro em 30/10/2026: contam a partir do marco registrado (em dias úteis,
 * do dia útil seguinte; desde 04/11/2026 cada prazo pode contar em dias corridos); os internos nascem com um padrão que
 * o admin edita; os da distribuidora vêm com os valores do engenheiro para a Copel (20261115100000). Prazo vencido só sinaliza: não muda etapa nem bloqueia nada. O cálculo é do banco
 * (`prazos_engenharia`); aqui ficam os nomes e o texto do selo.
 */

export const CHAVES_PRAZO_INTERNO = ["art", "a_iniciar", "projeto_em_elaboracao", "exigencia", "correcao_campo"] as const;
export const CHAVES_PRAZO_DISTRIBUIDORA = [
  "distribuidora_analise",
  "distribuidora_analise_rural",
  "distribuidora_vistoria",
  "distribuidora_conexao",
] as const;
/** Os que o admin configura (Configurações › Engenharia). */
export const CHAVES_PRAZO_CONFIG = [...CHAVES_PRAZO_INTERNO, ...CHAVES_PRAZO_DISTRIBUIDORA] as const;
/** Mais o da obra de rede, que vem da obra (prazo que a distribuidora informou no orçamento). */
export const CHAVES_PRAZO = [...CHAVES_PRAZO_CONFIG, "distribuidora_obra_rede"] as const;
export type ChavePrazo = (typeof CHAVES_PRAZO)[number];

export const ROTULO_PRAZO: Record<ChavePrazo, string> = {
  art: "Emitir a ART (TRT)",
  a_iniciar: "A iniciar",
  projeto_em_elaboracao: "Projeto em elaboração",
  exigencia: "Responder exigência da concessionária",
  correcao_campo: "Correção de campo após não conformidade",
  distribuidora_analise: "Aprovação do projeto pela distribuidora",
  distribuidora_analise_rural: "Aprovação do projeto pela distribuidora, zona rural",
  distribuidora_vistoria: "Vistoria pela distribuidora",
  distribuidora_conexao: "Conexão pela distribuidora",
  distribuidora_obra_rede: "Obra de rede da distribuidora",
};

/** De onde cada prazo conta (texto da configuração). */
export const MARCO_PRAZO: Record<ChavePrazo, string> = {
  art: "desde o pagamento confirmado, até o item da ART no checklist resolvido (sem checklist, até o protocolo)",
  a_iniciar: "desde a entrada na etapa",
  projeto_em_elaboracao: "desde a entrada na etapa",
  exigencia: "desde o registro da exigência (o prazo digitado na exigência vale mais)",
  correcao_campo: "desde a não conformidade",
  distribuidora_analise: "desde o protocolo ou o último reenvio",
  distribuidora_analise_rural: "desde o protocolo ou o último reenvio, quando o enquadramento diz zona rural",
  distribuidora_vistoria: "desde o pedido de vistoria",
  distribuidora_conexao: "desde a vistoria aprovada",
  distribuidora_obra_rede: "desde o pagamento à distribuidora, no prazo informado no orçamento",
};

export const ehChavePrazo = (v: string): v is ChavePrazo => (CHAVES_PRAZO as readonly string[]).includes(v);
export const prazoDaDistribuidora = (c: ChavePrazo) => c === "distribuidora_obra_rede" || (CHAVES_PRAZO_DISTRIBUIDORA as readonly string[]).includes(c);

export const CONTAGENS_PRAZO = ["uteis", "corridos"] as const;
export type ContagemPrazo = (typeof CONTAGENS_PRAZO)[number];
export const ROTULO_CONTAGEM: Record<ContagemPrazo, string> = { uteis: "dias úteis", corridos: "dias corridos" };
export const lerContagem = (v: unknown): ContagemPrazo => (v === "corridos" ? "corridos" : "uteis");

export type PrazoObra = { chave: ChavePrazo; limite: string; diasRestantes: number; contagem: ContagemPrazo };

/** "1 dia útil", "3 dias úteis"; em dias corridos, "1 dia", "3 dias". */
export const textoDias = (n: number, contagem: ContagemPrazo) =>
  contagem === "corridos" ? (n === 1 ? "1 dia" : `${n} dias`) : n === 1 ? "1 dia útil" : `${n} dias úteis`;

/** Texto e tom do selo: atrasado, vence hoje ou quantos dias faltam (na contagem do prazo). */
export function seloPrazo(p: PrazoObra): { texto: string; tom: "negativo" | "atencao" | "neutro" } {
  const quem = prazoDaDistribuidora(p.chave) ? "Prazo da distribuidora" : "Prazo interno";
  if (p.diasRestantes < 0) {
    const n = -p.diasRestantes;
    return { texto: `${quem} vencido há ${textoDias(n, p.contagem)}`, tom: "negativo" };
  }
  if (p.diasRestantes === 0) return { texto: `${quem} vence hoje`, tom: "atencao" };
  const n = p.diasRestantes;
  return { texto: `${quem}: ${textoDias(n, p.contagem)}`, tom: "neutro" };
}

/** Mais urgente primeiro (menos dias restantes). */
export const porUrgencia = (a: PrazoObra, b: PrazoObra) => a.diasRestantes - b.diasRestantes;

// ---------------------------------------------------------------------------
// Indicadores de desempenho
// ---------------------------------------------------------------------------

export const PERIODOS_INDICADORES = [30, 90] as const;
export type PeriodoIndicadores = (typeof PERIODOS_INDICADORES)[number];
export const lerPeriodo = (v: unknown): PeriodoIndicadores => (v === "90" ? 90 : 30);

export type Mediana = { mediana: number | null; n: number };
export type Proporcao = { com: number; total: number };
export type IndicadoresEngenharia = {
  carteira: { total: number; paradas: number };
  etapas: { etapa: string; mediana: number; n: number }[];
  protocoloAprovacao: Mediana;
  exigencia: Proporcao;
  naoConformidade: Proporcao;
  conexao: Mediana;
};

const numero = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const mediana = (v: unknown): Mediana => {
  const m = (v ?? {}) as { mediana?: unknown; n?: unknown };
  return { mediana: m.mediana == null ? null : numero(m.mediana), n: numero(m.n) };
};
const proporcao = (v: unknown): Proporcao => {
  const p = (v ?? {}) as { com?: unknown; total?: unknown };
  return { com: numero(p.com), total: numero(p.total) };
};

/** Converte o jsonb de `indicadores_engenharia`. */
export function lerIndicadores(bruto: unknown): IndicadoresEngenharia {
  const j = (bruto ?? {}) as Record<string, unknown>;
  const carteira = (j.carteira ?? {}) as { total?: unknown; paradas?: unknown };
  const etapas = Array.isArray(j.etapas) ? (j.etapas as { etapa?: unknown; mediana?: unknown; n?: unknown }[]) : [];
  return {
    carteira: { total: numero(carteira.total), paradas: numero(carteira.paradas) },
    etapas: etapas.map((e) => ({ etapa: String(e.etapa), mediana: numero(e.mediana), n: numero(e.n) })),
    protocoloAprovacao: mediana(j.protocolo_aprovacao),
    exigencia: proporcao(j.exigencia),
    naoConformidade: proporcao(j.nao_conformidade),
    conexao: mediana(j.conexao),
  };
}

const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "4,5 dias úteis" ou "—" sem amostra. */
export const textoMediana = (m: Mediana) => (m.n === 0 || m.mediana == null ? "—" : `${fmt.format(m.mediana)} ${m.mediana === 1 ? "dia útil" : "dias úteis"}`);
/** "25%" ou "—" sem amostra. */
export const textoProporcao = (p: Proporcao) => (p.total === 0 ? "—" : `${Math.round((p.com / p.total) * 100)}%`);
