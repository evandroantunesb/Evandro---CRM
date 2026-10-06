import type { ReactNode } from "react";
import "./gamificacao.css";

/**
 * Ambiente escuro da Gamificação (variáveis `--gf-*` e remapeamento dos componentes
 * claros em src/app/globals.css; escala tipográfica e layouts em `gamificacao.css`,
 * tudo escopado em `.tema-gamificacao`).
 *
 * O `<main>` de src/app/(app)/layout.tsx tem padding (p-4 / md:p-10); as margens negativas
 * (-m-4 / md:-m-10) com o mesmo padding interno fazem o fundo cobrir a área inteira, sem
 * faixa clara nas bordas. Usado pelo layout de /gamificacao e pelos layouts das telas
 * administrativas de /configuracoes (metas, comissões e resgates), que ficam fora da árvore
 * /gamificacao mas pertencem ao mesmo módulo.
 *
 * `@container`: as telas se adaptam à largura útil da página (que perde 256 px para o menu
 * lateral a partir de 768 px de janela), não à da janela.
 */
export function TemaGamificacao({ children }: { children: ReactNode }) {
  return (
    <div className="tema-gamificacao @container -m-4 min-h-screen bg-[var(--gf-bg)] p-4 text-[var(--gf-texto)] md:-m-10 md:p-10">
      {children}
    </div>
  );
}
