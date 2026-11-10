import { areaLigada, type Area, type TelasEmpresa } from "@/lib/telas-empresa";

/*
 * Endereço → área (telas por empresa, docs/superpowers/specs/2026-11-10-telas-por-empresa-design.md). Usado pelo menu,
 * pelas abas do celular e pelo índice de Configurações; os `layout.tsx` das mesmas pastas travam o acesso direto.
 * Endereço sem área: sempre fica (o papel continua decidindo).
 */
export const AREA_DO_ENDERECO: Readonly<Record<string, Area>> = {
  "/painel": "painel",
  "/leads-a-distribuir": "leads",
  "/forecast": "forecast",
  "/obras": "obras",
  "/engenharia": "engenharia",
  "/gamificacao": "gamificacao",
  "/configuracoes/metas": "gamificacao",
  "/configuracoes/comissoes": "gamificacao",
  "/configuracoes/resgates": "gamificacao",
  "/configuracoes/usuarios#perfil-gamificacao": "gamificacao",
  "/configuracoes/captura": "captura",
  "/compras": "pro",
  "/financeiro": "pro",
  "/pagamentos": "pro",
  "/tarefas/setores": "pro",
  "/configuracoes/equipes": "pro",
  "/configuracoes/tarefas-automaticas": "pro",
  "/configuracoes/compras": "pro",
  "/configuracoes/engenharia": "pro",
  "/configuracoes/prazos-obras": "pro",
  "/configuracoes/deducoes-obras": "pro",
  "/configuracoes/fixacoes": "pro",
};

/** Área de um endereço: o atalho com `#` exato primeiro; depois o prefixo mais longo que casa por segmento. */
export function areaDoEndereco(href: string): Area | null {
  const exato = AREA_DO_ENDERECO[href];
  if (exato) return exato;
  const caminho = href.split(/[?#]/)[0];
  let melhor: string | null = null;
  for (const prefixo of Object.keys(AREA_DO_ENDERECO)) {
    if (prefixo.includes("#")) continue;
    if ((caminho === prefixo || caminho.startsWith(`${prefixo}/`)) && (!melhor || prefixo.length > melhor.length)) melhor = prefixo;
  }
  return melhor ? AREA_DO_ENDERECO[melhor] : null;
}

export function filtrarPorTelas<T extends { href: string }>(itens: readonly T[], telas: TelasEmpresa): T[] {
  return itens.filter((item) => {
    const area = areaDoEndereco(item.href);
    return area == null || areaLigada(telas, area);
  });
}
