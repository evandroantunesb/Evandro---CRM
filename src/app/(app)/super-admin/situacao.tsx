import { Selo } from "@/components/ui";

const TOM = { ativa: "positivo", suspensa: "atencao", cancelada: "negativo" } as const;
const ROTULO = { ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada" } as const;

export function SeloSituacao({ situacao }: { situacao: keyof typeof TOM }) {
  return <Selo tom={TOM[situacao]}>{ROTULO[situacao]}</Selo>;
}
