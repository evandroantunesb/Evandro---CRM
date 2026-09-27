import type { BlocoRenderizavel } from "./pdf-tipos";

/**
 * Para cada bloco (já filtrado e ordenado), diz se ele deve começar em uma
 * página nova. Regras: "nova_pagina" e "pagina_exclusiva" sempre quebram antes;
 * o bloco seguinte a um "pagina_exclusiva" também quebra, pra garantir que
 * nada mais compartilhe a página dele. O primeiro bloco nunca quebra (já
 * começa no topo da página de conteúdo).
 */
export function calcularQuebras(blocos: Pick<BlocoRenderizavel, "quebraPagina">[]): boolean[] {
  return blocos.map((bloco, i) => {
    if (i === 0) return false;
    if (bloco.quebraPagina !== "auto") return true;
    return blocos[i - 1]!.quebraPagina === "pagina_exclusiva";
  });
}
