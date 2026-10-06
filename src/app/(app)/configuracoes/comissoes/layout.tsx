import type { ReactNode } from "react";
import { TemaGamificacao } from "../../gamificacao/_compartilhado/tema-gamificacao";

// Tela administrativa da Gamificação que fica fora de /gamificacao (a rota não muda):
// recebe o mesmo ambiente escuro do módulo.
export default function LayoutConfiguracaoGamificacao({ children }: { children: ReactNode }) {
  return <TemaGamificacao>{children}</TemaGamificacao>;
}
