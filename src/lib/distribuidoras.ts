/**
 * Resolução de distribuidora por município (Etapa 1 do wizard "Adicionar
 * negócio" — pedido do Evandro em 2026-09-30). Fluxo desejado: cidade/UF do
 * negócio → município (código IBGE) → distribuidora(s) que atendem esse
 * município → tarifa homologada (via `buscarTarifaHomologada`, já existente
 * em `src/lib/aneel.ts`). Município e distribuidora vêm de
 * `municipios_ibge`/`municipios_distribuidoras` (ver ação em
 * `src/lib/acoes/distribuidora.ts`) — esta função só decide o que fazer com
 * as candidatas encontradas, sem tocar em banco, pra ficar testável.
 */

export type DistribuidoraCandidata = {
  codigoIbge: string;
  siglaDistribuidora: string;
  nomeDistribuidora: string;
};

export type ResolucaoDistribuidora =
  | { tipo: "unica"; distribuidora: DistribuidoraCandidata }
  | { tipo: "ambigua"; distribuidoras: DistribuidoraCandidata[] }
  | { tipo: "nao_encontrada" };

/** Maiúsculas, sem acento, sem espaço nas pontas — pra comparar nome de cidade digitado à mão com o cadastro do IBGE. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Município sem nenhuma distribuidora cadastrada: não encontrada (cai pra
 * seleção manual). Uma só: preenche automático. Mais de uma (município na
 * fronteira entre áreas de concessão): pede seleção ao vendedor — nunca
 * escolhe sozinho entre concessionárias diferentes.
 */
export function resolverDistribuidora(candidatas: DistribuidoraCandidata[]): ResolucaoDistribuidora {
  if (candidatas.length === 0) return { tipo: "nao_encontrada" };
  if (candidatas.length === 1) return { tipo: "unica", distribuidora: candidatas[0] };
  return { tipo: "ambigua", distribuidoras: candidatas };
}
