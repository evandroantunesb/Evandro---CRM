import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";

// Apresentação (Gantt) é só do PRO: no Solo, Obras é a versão checklist (subprojeto 4b, 20261207100000_obra_solo.sql).
export default async function LayoutApresentacaoObras({ children }: { children: ReactNode }) {
  return (await telaPermitida("pro")) ? children : <TelaDesligada />;
}
