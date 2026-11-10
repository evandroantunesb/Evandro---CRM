import { GESTAO_COMERCIAL, pode, TAREFAS_DO_SETOR } from "@/lib/permissoes";
import { TELAS_PADRAO, areaLigada, type TelasEmpresa } from "@/lib/telas-empresa";

/** Pendências do sininho — tipos e links, sem dependência de servidor (contagem em lib/notificacoes). */

export type ContagemPendencias = {
  /** Leads da fila de distribuição (só admin/gestor; 0 para os demais papéis). */
  leadsADistribuir: number;
  /** Tarefas atrasadas + leads sem contato + leads parados + propostas paradas; na Operação, as tarefas do setor abertas. */
  demais: number;
};

export type LinkPendencias = { href: string; texto: string };

/**
 * Links de pendências do sininho. Admin/gestor: a fila de distribuição vai direto para
 * /leads-a-distribuir e o resto para /painel. Vendedor/SDR: tudo para /inicio, como sempre. Operação: /tarefas/setores.
 * Telas por empresa: sem o Painel (Solo ou desligado) o resto vai para /inicio; sem Leads a distribuir, a fila não aparece.
 */
export function linksPendencias(papel: string | undefined, contagem: ContagemPendencias, telas: TelasEmpresa = TELAS_PADRAO): LinkPendencias[] {
  const textoDemais = contagem.demais > 0 ? `${contagem.demais} pendência${contagem.demais === 1 ? "" : "s"}` : "Nenhuma pendência";
  if (pode(papel, TAREFAS_DO_SETOR)) return [{ href: "/tarefas/setores", texto: textoDemais }];
  if (!pode(papel, GESTAO_COMERCIAL)) return [{ href: "/inicio", texto: textoDemais }];

  const links: LinkPendencias[] = [];
  if (contagem.leadsADistribuir > 0 && areaLigada(telas, "leads")) {
    const n = contagem.leadsADistribuir;
    links.push({ href: "/leads-a-distribuir", texto: `${n} lead${n === 1 ? "" : "s"} a distribuir` });
  }
  if (contagem.demais > 0 || links.length === 0) links.push({ href: areaLigada(telas, "painel") ? "/painel" : "/inicio", texto: textoDemais });
  return links;
}
