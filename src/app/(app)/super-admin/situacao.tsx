import { SeloCabecalho } from "@/components/cabecalho-pagina";
import { Selo } from "@/components/ui";

const TOM = { ativa: "positivo", suspensa: "atencao", cancelada: "negativo" } as const;
const ROTULO = { ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada" } as const;

export function SeloSituacao({ situacao, naFaixa = false }: { situacao: keyof typeof TOM; naFaixa?: boolean }) {
  return naFaixa ? <SeloCabecalho tom={TOM[situacao]}>{ROTULO[situacao]}</SeloCabecalho> : <Selo tom={TOM[situacao]}>{ROTULO[situacao]}</Selo>;
}
