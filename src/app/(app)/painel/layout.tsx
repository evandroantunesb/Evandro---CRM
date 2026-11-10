import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";

// Área que a empresa pode não ter (telas por empresa, 20261203100000_telas_empresa.sql).
export default async function LayoutPainel({ children }: { children: ReactNode }) {
  return (await telaPermitida("painel")) ? children : <TelaDesligada />;
}
