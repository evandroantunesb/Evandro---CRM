import type { ReactNode } from "react";

/**
 * Ambiente escuro da Gamificação (variáveis `--gf-*` e remapeamento dos componentes
 * claros em src/app/globals.css, escopados em `.tema-gamificacao`).
 *
 * O `<main>` de src/app/(app)/layout.tsx tem padding (p-4 / md:p-10); as margens negativas
 * (-m-4 / md:-m-10) com o mesmo padding interno fazem o fundo cobrir a área inteira, sem
 * faixa clara nas bordas. Usado pelo layout de /gamificacao e pelos layouts das telas
 * administrativas de /configuracoes (metas, comissões e resgates), que ficam fora da árvore
 * /gamificacao mas pertencem ao mesmo módulo.
 */
export function TemaGamificacao({ children }: { children: ReactNode }) {
  return (
    <div className="tema-gamificacao -m-4 min-h-screen bg-[var(--gf-bg)] p-4 text-[var(--gf-texto)] md:-m-10 md:p-10">
      {children}
    </div>
  );
}
