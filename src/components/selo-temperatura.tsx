import { Flame, Snowflake, Thermometer } from "lucide-react";
import { ROTULO_TEMPERATURA, type TemperaturaNegocio } from "@/lib/temperatura";

const ESTILO = {
  quente: { Icone: Flame, classe: "bg-dourado/15 text-dourado-texto" },
  morno: { Icone: Thermometer, classe: "bg-superficie-2 text-texto-2" },
  frio: { Icone: Snowflake, classe: "border border-linha text-texto-2" },
} as const;

/** Sobre a faixa escura do cabeçalho: vidro claro; o quente mantém o dourado. */
const ESTILO_FAIXA = { quente: "bg-dourado/22 text-[#ecd78f]", morno: "bg-white/12 text-offwhite", frio: "bg-white/12 text-offwhite" } as const;

/**
 * Selo de temperatura com o "porquê" (nome da regra que decidiu). Ícone + texto: não depende só de cor
 * (vermelho e verde ficam reservados a perda/erro e WhatsApp).
 */
export function SeloTemperatura({ valor, detalhado = false, naFaixa = false }: { valor: TemperaturaNegocio; detalhado?: boolean; naFaixa?: boolean }) {
  const { Icone } = ESTILO[valor.temperatura];
  const classe = naFaixa ? ESTILO_FAIXA[valor.temperatura] : ESTILO[valor.temperatura].classe;
  const rotulo = ROTULO_TEMPERATURA[valor.temperatura];
  return (
    <span
      title={detalhado ? undefined : valor.porque}
      aria-label={`${rotulo}: ${valor.porque}`}
      className={`inline-flex items-center gap-1 rounded-full py-0.5 text-xs font-medium ${naFaixa ? "px-2.5" : "px-2"} ${classe}`}
    >
      <Icone size={12} aria-hidden />
      <span aria-hidden>{detalhado ? `${rotulo} · ${valor.porque}` : rotulo}</span>
    </span>
  );
}
