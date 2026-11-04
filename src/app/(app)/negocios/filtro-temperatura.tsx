import { Flame, Snowflake, Thermometer } from "lucide-react";
import Link from "next/link";
import { FOCO } from "@/components/ui";
import { ROTULO_TEMPERATURA, type Temperatura } from "@/lib/temperatura";

export const TEMPERATURAS = ["quente", "morno", "frio"] as const satisfies readonly Temperatura[];

const ICONE = { quente: Flame, morno: Thermometer, frio: Snowflake } as const;

/**
 * Chips Quente/Morno/Frio da barra de Negócios (desenho "Negócios - aprovado"). Cada chip é um link que liga
 * o filtro; tocar no chip ativo desliga. A contagem considera os demais filtros em uso.
 */
export function FiltroTemperatura({
  ativa,
  contagem,
  link,
}: {
  ativa: Temperatura | null;
  contagem: Record<Temperatura, number>;
  link: (t: Temperatura | null) => string;
}) {
  return (
    <div
      role="group"
      aria-label="Temperatura"
      className="flex shrink-0 items-center gap-1.5 self-start rounded-full bg-superficie-2 py-1 pr-1 pl-3 max-md:w-full max-md:overflow-x-auto max-md:[scrollbar-width:none]"
    >
      <span className="text-xs font-semibold text-texto-2">Temperatura</span>
      {TEMPERATURAS.map((t) => {
        const Icone = ICONE[t];
        const ligada = ativa === t;
        return (
          <Link
            key={t}
            href={link(ligada ? null : t)}
            aria-current={ligada ? "true" : undefined}
            aria-label={`${ROTULO_TEMPERATURA[t]}: ${contagem[t]} ${contagem[t] === 1 ? "negócio" : "negócios"}${ligada ? " (filtro ligado, toque para desligar)" : ""}`}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-200 ease-raion md:min-h-8 ${FOCO} ${
              ligada ? "bg-superficie font-semibold text-texto shadow-sm ring-1 ring-dourado" : "text-texto-2 hover:bg-superficie hover:text-texto"
            }`}
          >
            <Icone size={14} className={t === "quente" ? "text-dourado-texto" : undefined} aria-hidden />
            {ROTULO_TEMPERATURA[t]}
            <span className={`tabular-nums ${ligada ? "rounded-full bg-dourado/15 px-1.5 text-xs text-dourado-texto" : "text-xs"}`} aria-hidden>
              {contagem[t]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
