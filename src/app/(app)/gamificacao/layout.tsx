import type { ReactNode } from "react";

// Escopa as variáveis do tema escuro (.tema-gamificacao, ver globals.css) a toda a
// árvore /gamificacao, sem aplicar fundo ou cor de texto por padrão. Cada página já
// redesenhada pinta seu próprio fundo escuro (ver page.tsx e extrato/page.tsx); as
// telas ainda não redesenhadas continuam herdando a aparência atual até sua vez.
export default function LayoutGamificacao({ children }: { children: ReactNode }) {
  return <div className="tema-gamificacao">{children}</div>;
}
