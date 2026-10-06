import { CheckCircle2, Clock } from "lucide-react";
import { ROTULO_STATUS_COMISSAO, type StatusComissao } from "@/lib/tipos";
import { BadgeGf } from "./ui";

/** "outubro de 2026" → "Outubro de 2026" (referência mensal da comissão, sempre em UTC). */
export function formatarReferenciaComissao(referencia: string) {
  const texto = new Date(`${referencia}T00:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Status do cálculo: fechada (neutro, check) ou aberta (atenção, relógio) — texto + ícone, não só cor. */
export function StatusComissaoGf({ status }: { status: StatusComissao }) {
  const fechada = status === "fechada";
  return (
    <BadgeGf tom={fechada ? "neutro" : "atencao"} Icone={fechada ? CheckCircle2 : Clock}>
      {ROTULO_STATUS_COMISSAO[status]}
    </BadgeGf>
  );
}
