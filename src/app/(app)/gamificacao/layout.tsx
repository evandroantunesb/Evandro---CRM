import type { ReactNode } from "react";

// Tema escuro escopado à árvore /gamificacao (ver globals.css, .tema-gamificacao).
// As margens negativas cobrem o padding do <main> do layout pai pra que o fundo
// escuro vá até a borda, em vez de aparecer como um cartão inset sobre o offwhite.
export default function LayoutGamificacao({ children }: { children: ReactNode }) {
  return (
    <div className="tema-gamificacao -m-4 min-h-screen bg-[var(--gf-bg)] p-4 text-[var(--gf-texto)] md:-m-10 md:p-10">
      {children}
    </div>
  );
}
