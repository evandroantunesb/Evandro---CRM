import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";
import { TemaGamificacao } from "../../gamificacao/_compartilhado/tema-gamificacao";

// Tela administrativa da Gamificação que fica fora de /gamificacao (a rota não muda):
// recebe o mesmo ambiente escuro do módulo e some com a Gamificação desligada.
export default async function LayoutConfiguracaoGamificacao({ children }: { children: ReactNode }) {
  if (!(await telaPermitida("gamificacao"))) return <TelaDesligada />;
  return <TemaGamificacao>{children}</TemaGamificacao>;
}
