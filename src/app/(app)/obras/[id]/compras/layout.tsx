import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";

// Compras da obra é só do PRO: a obra do Solo não tem setores (subprojeto 4b, 20261207100000_obra_solo.sql).
export default async function LayoutComprasObra({ children }: { children: ReactNode }) {
  return (await telaPermitida("pro")) ? children : <TelaDesligada />;
}
