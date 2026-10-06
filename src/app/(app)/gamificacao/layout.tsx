import type { ReactNode } from "react";
import { TemaGamificacao } from "./_compartilhado/tema-gamificacao";

// Toda a árvore /gamificacao usa o mesmo ambiente escuro (fundo + texto + variáveis --gf-*,
// ver globals.css e _compartilhado/gamificacao.css). As páginas não pintam fundo próprio:
// a superfície é contínua.
export default function LayoutGamificacao({ children }: { children: ReactNode }) {
  return <TemaGamificacao>{children}</TemaGamificacao>;
}
