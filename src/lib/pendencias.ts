/** Pendências do sininho — tipos e links, sem dependência de servidor (contagem em lib/notificacoes). */

export type ContagemPendencias = {
  /** Leads da fila de distribuição (só admin/gestor; 0 para os demais papéis). */
  leadsADistribuir: number;
  /** Tarefas atrasadas + leads sem contato + leads parados + propostas paradas. */
  demais: number;
};

export type LinkPendencias = { href: string; texto: string };

/**
 * Links de pendências do sininho. Admin/gestor: a fila de distribuição vai direto para
 * /leads-a-distribuir e o resto para /painel. Vendedor/SDR: tudo para /inicio, como sempre.
 */
export function linksPendencias(papel: string | undefined, contagem: ContagemPendencias): LinkPendencias[] {
  const textoDemais = contagem.demais > 0 ? `${contagem.demais} pendência${contagem.demais === 1 ? "" : "s"}` : "Nenhuma pendência";
  if (papel !== "admin" && papel !== "gestor") return [{ href: "/inicio", texto: textoDemais }];

  const links: LinkPendencias[] = [];
  if (contagem.leadsADistribuir > 0) {
    const n = contagem.leadsADistribuir;
    links.push({ href: "/leads-a-distribuir", texto: `${n} lead${n === 1 ? "" : "s"} a distribuir` });
  }
  if (contagem.demais > 0 || links.length === 0) links.push({ href: "/painel", texto: textoDemais });
  return links;
}
