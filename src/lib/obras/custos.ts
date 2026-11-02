import type { EtapaObra } from "./cronograma";

/**
 * Custos e lucro da obra (OPR), pela lógica do desenho aprovado "Obras — Apresentação":
 *  - cada categoria encerra quando a etapa dela termina; encerrada, vale o realizado; em andamento, vale o maior entre
 *    o planejado e o realizado — a soma é o custo projetado;
 *  - lucro líquido previsto = venda − custo projetado − impostos e comissões (% da venda);
 *  - margem projetada (antes de impostos) = (venda − custo projetado) / venda; a planejada usa o custo planejado;
 *  - a barra do planejado ocupa 85% da trilha e o realizado é proporcional a ela (até 100%).
 * Funções puras: os valores vêm do banco (`obra_orcamento`, `obra_custos`, `obra_deducoes`, valor vendido).
 */

export const CATEGORIAS_CUSTO_OBRA = ["equipamentos", "estrutura_materiais", "mao_de_obra", "homologacao", "frete"] as const;
export type CategoriaCustoObra = (typeof CATEGORIAS_CUSTO_OBRA)[number];

export const ROTULO_CATEGORIA_CUSTO: Record<CategoriaCustoObra, string> = {
  equipamentos: "Equipamentos",
  estrutura_materiais: "Estrutura e materiais",
  mao_de_obra: "Mão de obra",
  homologacao: "Homologação",
  frete: "Frete",
};

/** Etapa cujo fim encerra a categoria. */
export const ETAPA_DA_CATEGORIA: Record<CategoriaCustoObra, EtapaObra> = {
  equipamentos: "compra",
  estrutura_materiais: "compra",
  mao_de_obra: "instalacao",
  homologacao: "homologacao",
  frete: "entrega_material",
};

export const ehCategoriaCusto = (v: string): v is CategoriaCustoObra => (CATEGORIAS_CUSTO_OBRA as readonly string[]).includes(v);

const PLANEJADO_NA_TRILHA = 85;
const centavos = (v: number) => Math.round(v * 100) / 100;

export type CustoCategoriaVM = {
  categoria: CategoriaCustoObra;
  nome: string;
  planejado: number;
  realizado: number;
  encerrada: boolean;
  /** Valor que entra no custo projetado. */
  projetado: number;
  /** Diferença do realizado sobre o planejado, em %, só com a categoria encerrada e planejado > 0. */
  desvioPct: number | null;
  /** Largura do realizado na trilha, em %. */
  largura: number;
  acima: boolean;
};

export type CustosObraVM = {
  categorias: CustoCategoriaVM[];
  planejado: number;
  realizado: number;
  projetado: number;
  /** Realizado / planejado, em %; null sem planejado. */
  realizadoPct: number | null;
};

export function montarCustos(entrada: {
  orcamento: readonly { categoria: string; planejado: number }[];
  lancamentos: readonly { categoria: string; valor: number }[];
  etapasConcluidas: ReadonlySet<string>;
}): CustosObraVM {
  const planejado = new Map(entrada.orcamento.map((o) => [o.categoria, Number(o.planejado)]));
  const realizado = new Map<string, number>();
  for (const l of entrada.lancamentos) realizado.set(l.categoria, (realizado.get(l.categoria) ?? 0) + Number(l.valor));

  const categorias = CATEGORIAS_CUSTO_OBRA.map((categoria): CustoCategoriaVM => {
    const p = centavos(planejado.get(categoria) ?? 0);
    const r = centavos(realizado.get(categoria) ?? 0);
    const encerrada = entrada.etapasConcluidas.has(ETAPA_DA_CATEGORIA[categoria]);
    return {
      categoria,
      nome: ROTULO_CATEGORIA_CUSTO[categoria],
      planejado: p,
      realizado: r,
      encerrada,
      projetado: encerrada ? r : Math.max(p, r),
      desvioPct: encerrada && p > 0 ? ((r - p) / p) * 100 : null,
      largura: p > 0 ? Math.min(100, (PLANEJADO_NA_TRILHA * r) / p) : r > 0 ? 100 : 0,
      acima: r > p,
    };
  });
  const soma = (f: (c: CustoCategoriaVM) => number) => centavos(categorias.reduce((t, c) => t + f(c), 0));
  const totalPlanejado = soma((c) => c.planejado);
  const totalRealizado = soma((c) => c.realizado);
  return {
    categorias,
    planejado: totalPlanejado,
    realizado: totalRealizado,
    projetado: soma((c) => c.projetado),
    realizadoPct: totalPlanejado > 0 ? (totalRealizado / totalPlanejado) * 100 : null,
  };
}

export type ResultadoObraVM = {
  venda: number;
  custoProjetado: number;
  deducoes: number;
  lucro: number;
  lucroPct: number | null;
  lucroPlanejado: number;
  /** Lucro projetado − lucro planejado (negativo = abaixo do planejado). */
  diferenca: number;
  margemProjetadaPct: number | null;
  margemPlanejadaPct: number | null;
};

/** Lucro e margens da obra. `deducoesPct` = impostos + comissões, em % da venda. */
export function resultadoObra(venda: number, custos: CustosObraVM, deducoesPct: number): ResultadoObraVM {
  const deducoes = centavos((venda * deducoesPct) / 100);
  const lucro = centavos(venda - custos.projetado - deducoes);
  const lucroPlanejado = centavos(venda - custos.planejado - deducoes);
  const pct = (v: number) => (venda > 0 ? (v / venda) * 100 : null);
  return {
    venda,
    custoProjetado: custos.projetado,
    deducoes,
    lucro,
    lucroPct: pct(lucro),
    lucroPlanejado,
    diferenca: centavos(lucro - lucroPlanejado),
    margemProjetadaPct: pct(venda - custos.projetado),
    margemPlanejadaPct: pct(venda - custos.planejado),
  };
}
