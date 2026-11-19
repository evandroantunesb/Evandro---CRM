import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";

// Agenda operacional: só no PRO (decisão do Evandro em 18/11/2026).
export default async function LayoutAgenda({ children }: { children: ReactNode }) {
  return (await telaPermitida("pro")) ? children : <TelaDesligada />;
}
