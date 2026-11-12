import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";

// Área do setor Engenharia, que a empresa pode não ter (setores da obra, 20261206100000_setores_da_obra.sql).
export default async function LayoutConfiguracaoEngenharia({ children }: { children: ReactNode }) {
  return (await telaPermitida("engenharia")) ? children : <TelaDesligada />;
}
