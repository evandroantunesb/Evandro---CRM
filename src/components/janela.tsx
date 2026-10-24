"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Janela sobre a tela, no `<dialog>` nativo em modo modal: o navegador cuida do Esc, mantém o foco
 * dentro dela e deixa o resto da página inerte (a rolagem do fundo trava em globals.css).
 * No celular sobe de baixo, com os cantos de cima arredondados (ações ao alcance do polegar);
 * a partir de md fica centralizada. Fecha pelo X, pelo Esc ou tocando fora; com `fechaSoPelosBotoes`,
 * só pelo X e pelos botões do conteúdo (para não perder o que foi digitado por um toque acidental).
 */
export function Janela({
  aberta,
  aoFechar,
  titulo,
  children,
  fechaSoPelosBotoes = false,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  fechaSoPelosBotoes?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberta && !el.open) {
      el.showModal();
      // O navegador foca o primeiro controle (o X); um campo marcado com data-foco-inicial tem preferência.
      el.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
    }
    if (!aberta && el.open) el.close();
  }, [aberta]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClose={aoFechar}
      // Esc dispara "cancel" antes de fechar: barrado quando só os botões podem fechar.
      onCancel={(e) => {
        if (fechaSoPelosBotoes) e.preventDefault();
      }}
      // O próprio <dialog> só recebe o clique fora do conteúdo (no fundo escurecido).
      onClick={(e) => {
        e.stopPropagation();
        if (!fechaSoPelosBotoes && e.target === e.currentTarget) aoFechar();
      }}
      // A janela pode estar dentro de algo arrastável (cartão do Kanban): toques nela não chegam lá.
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-0 text-texto shadow-2xl backdrop:bg-[rgb(15_15_16/0.55)] backdrop:backdrop-blur-[2px] open:animate-subir md:m-auto md:max-h-[85vh] md:max-w-md md:rounded-3xl"
    >
      <div className="flex flex-col gap-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pt-6">
        <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-linha md:hidden" />
        <div className="flex items-center justify-between gap-3">
          <h2 id={idTitulo} className="text-lg font-semibold tracking-tight text-texto">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-texto-2 transition-colors duration-200 ease-raion hover:bg-superficie-2 hover:text-texto focus-visible:ring-2 focus-visible:ring-dourado/60 focus-visible:outline-none"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
