import { Monitor, Moon, Sun } from "lucide-react";
import { definirTema } from "@/lib/acoes/tema";
import { ROTULO_TEMA, TEMAS, type Tema } from "@/lib/tema";

const ICONE: Record<Tema, typeof Sun> = { claro: Sun, escuro: Moon, sistema: Monitor };

/**
 * Claro, escuro ou do aparelho. Na barra lateral (sempre escura), junto do usuário; com `naJanela`,
 * nas cores do tema e com alvos de 44 px (menu "Mais" do celular).
 */
export function SeletorTema({ tema, naJanela = false }: { tema: Tema; naJanela?: boolean }) {
  return (
    <form
      action={definirTema}
      role="group"
      aria-label="Tema"
      className={`flex gap-1 rounded-full border p-0.5 ${naJanela ? "border-linha bg-superficie-2" : "border-white/10"}`}
    >
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
            className={`grid place-items-center rounded-full transition-colors duration-200 ease-raion ${
              naJanela
                ? "h-11 w-11 text-texto-2 hover:text-texto aria-pressed:bg-superficie aria-pressed:text-dourado-texto aria-pressed:shadow-sm"
                : "h-8 w-8 text-offwhite/60 hover:text-offwhite aria-pressed:bg-white/10 aria-pressed:text-dourado"
            }`}
          >
            <Icone size={naJanela ? 17 : 15} />
          </button>
        );
      })}
    </form>
  );
}
