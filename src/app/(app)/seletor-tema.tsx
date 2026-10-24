import { Monitor, Moon, Sun } from "lucide-react";
import { definirTema } from "@/lib/acoes/tema";
import { ROTULO_TEMA, TEMAS, type Tema } from "@/lib/tema";

const ICONE: Record<Tema, typeof Sun> = { claro: Sun, escuro: Moon, sistema: Monitor };

/** Claro, escuro ou do aparelho: fica na barra lateral (sempre escura), junto do usuário. */
export function SeletorTema({ tema }: { tema: Tema }) {
  return (
    <form action={definirTema} role="group" aria-label="Tema" className="flex gap-1 rounded-full border border-white/10 p-0.5">
      {TEMAS.map((t) => {
        const Icone = ICONE[t];
        return (
          <button
            key={t}
            name="tema"
            value={t}
            aria-pressed={tema === t}
            aria-label={ROTULO_TEMA[t]}
            title={ROTULO_TEMA[t]}
            className="grid h-8 w-8 place-items-center rounded-full text-offwhite/60 transition-colors duration-200 ease-raion hover:text-offwhite aria-pressed:bg-white/10 aria-pressed:text-dourado"
          >
            <Icone size={15} />
          </button>
        );
      })}
    </form>
  );
}
