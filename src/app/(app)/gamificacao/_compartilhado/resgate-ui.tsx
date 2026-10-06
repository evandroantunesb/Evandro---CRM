import { CheckCircle2, Clock, PackageCheck, XCircle } from "lucide-react";
import { ROTULO_STATUS_RESGATE, type StatusResgate } from "@/lib/tipos";
import { BadgeGf, type IconeGf } from "./ui";

const ESTADO: Record<StatusResgate, { tom: "neutro" | "positivo" | "negativo" | "atencao"; Icone: IconeGf }> = {
  solicitado: { tom: "atencao", Icone: Clock },
  aprovado: { tom: "neutro", Icone: CheckCircle2 },
  entregue: { tom: "positivo", Icone: PackageCheck },
  cancelado: { tom: "negativo", Icone: XCircle },
};

/** Status do resgate (mesmos tons de antes), agora com ícone: o estado não depende só de cor. */
export function StatusResgateGf({ status }: { status: StatusResgate }) {
  const { tom, Icone } = ESTADO[status];
  return (
    <BadgeGf tom={tom} Icone={Icone}>
      {ROTULO_STATUS_RESGATE[status]}
    </BadgeGf>
  );
}
