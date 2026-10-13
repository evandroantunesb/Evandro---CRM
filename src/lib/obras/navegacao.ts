import { filtrarObras, type FiltrosObras } from "./derivados";
import { ALERTAS_OBRA, ESTADOS_SETOR, SETORES_OBRA, SITUACOES_OBRA } from "./rotulos";

/**
 * Navegação sequencial entre obras (Anterior / Próxima / "Obra X de N" / seletor), comum aos
 * modos Gestão e Apresentação. Tudo puro: a lista navegável é SEMPRE recalculada no servidor a
 * partir de `carregarObras` (empresa atual + RLS) e dos mesmos filtros da listagem, que viajam
 * na URL. Nada aqui concede acesso: uma obra fora da lista do usuário simplesmente não aparece.
 */

type Params = Record<string, string | string[] | undefined>;

const umDe = <T extends string>(valores: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" ? valores.find((x) => x === v) : undefined;

/** Teto da busca na URL: evita query string abusiva. */
const MAX_BUSCA = 100;

/** Lê os filtros da listagem a partir dos parâmetros da URL; valor desconhecido é ignorado. */
export function filtrosDeParams(params: Params): FiltrosObras {
  const busca = typeof params.q === "string" ? params.q.trim().slice(0, MAX_BUSCA) : "";
  return {
    busca: busca || undefined,
    situacao: umDe(SITUACOES_OBRA, params.situacao),
    alerta: umDe(ALERTAS_OBRA, params.alerta),
    setor: umDe(SETORES_OBRA, params.setor),
    estado: umDe(ESTADOS_SETOR, params.estado),
  };
}

/** Query string dos filtros (sem "?"), na ordem fixa da listagem. Vazia quando não há filtro. */
export function queryDosFiltros(filtros: FiltrosObras): string {
  const p = new URLSearchParams();
  if (filtros.busca) p.set("q", filtros.busca);
  if (filtros.situacao) p.set("situacao", filtros.situacao);
  if (filtros.alerta) p.set("alerta", filtros.alerta);
  if (filtros.setor) p.set("setor", filtros.setor);
  if (filtros.estado) p.set("estado", filtros.estado);
  return p.toString();
}

/** Algum filtro que de fato restringe a lista (setor sozinho não filtra). */
export const temFiltroAtivo = (f: FiltrosObras) => Boolean(f.busca || f.situacao || f.alerta || f.estado);

export type ItemNavegacaoObra = { id: string; rotulo: string };

export type NavegacaoObra = {
  /** Obras navegáveis, na ordem da listagem (só id e rótulo "#número Cliente"). */
  itens: ItemNavegacaoObra[];
  /** Posição da obra atual (1-based); null se ela não estiver na lista filtrada. */
  posicao: number | null;
  total: number;
  anteriorId: string | null;
  proximaId: string | null;
};

type ObraNavegavel = Parameters<typeof filtrarObras>[0][number] & { id: string };

/**
 * Monta a navegação a partir das obras JÁ carregadas para o usuário (mesma ordem da lista).
 * Fora da lista (filtro mudou, obra deixou de bater com o filtro): sem posição, e Anterior/Próxima
 * levam ao fim e ao início da lista, para o usuário voltar a percorrê-la sem ir à listagem.
 */
export function montarNavegacao(obras: readonly ObraNavegavel[], filtros: FiltrosObras, atualId: string): NavegacaoObra {
  const itens = filtrarObras(obras, filtros).map((o) => ({ id: o.id, rotulo: `#${o.numero} ${o.clienteNome}` }));
  const total = itens.length;
  const indice = itens.findIndex((i) => i.id === atualId);
  if (indice === -1) {
    return { itens, posicao: null, total, anteriorId: itens.at(-1)?.id ?? null, proximaId: itens[0]?.id ?? null };
  }
  return {
    itens,
    posicao: indice + 1,
    total,
    anteriorId: indice > 0 ? itens[indice - 1].id : null,
    proximaId: indice < total - 1 ? itens[indice + 1].id : null,
  };
}

/** Endereço de uma obra no modo, preservando os filtros. */
export function hrefObra(base: string, id: string, query: string): string {
  return `${base}/${id}${query ? `?${query}` : ""}`;
}
