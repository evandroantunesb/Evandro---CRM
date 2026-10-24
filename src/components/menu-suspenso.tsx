"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Aparência de um item do menu (botão ou link), nas cores do tema; 44 px de alvo no celular. */
export const CLASSE_ITEM_MENU =
  "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-texto transition-colors duration-150 hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none disabled:opacity-50 md:min-h-9";

const MARGEM = 8;

/**
 * Menu suspenso genérico, num `popover` nativo (manual): fica na camada de cima, então nada o corta,
 * nem o quadro do Kanban que rola para o lado. Fecha num item, tocando fora, com Esc e ao rolar.
 * Abre embaixo do botão, ou em cima quando não cabe. Usado pelo "Mover para" e outros menus de card.
 */
export function MenuSuspenso({
  trigger,
  children,
  alinhamento = "direita",
}: {
  trigger: (estado: { aberto: boolean; alternar: () => void }) => ReactNode;
  children: ReactNode;
  alinhamento?: "direita" | "esquerda";
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // O estado manda; o popover acompanha e é posicionado junto do botão.
  useEffect(() => {
    const m = menu.current;
    if (!m) return;
    const estaAberto = m.matches(":popover-open");
    if (!aberto) {
      if (estaAberto) m.hidePopover();
      return;
    }
    if (!estaAberto) m.showPopover();
    const gatilho = ref.current?.firstElementChild?.getBoundingClientRect();
    if (!gatilho) return;
    const altura = m.offsetHeight;
    const cabeEmbaixo = gatilho.bottom + MARGEM + altura <= window.innerHeight;
    m.style.top = `${cabeEmbaixo ? gatilho.bottom + 6 : Math.max(MARGEM, gatilho.top - 6 - altura)}px`;
    if (alinhamento === "direita") {
      m.style.left = "auto";
      m.style.right = `${Math.max(MARGEM, window.innerWidth - gatilho.right)}px`;
    } else {
      m.style.right = "auto";
      m.style.left = `${Math.max(MARGEM, gatilho.left)}px`;
    }
  }, [aberto, alinhamento]);

  // Fecha ao tocar fora (botão e menu ficam dentro de `ref`), com Esc (o foco volta ao botão) e ao
  // rolar ou redimensionar: aberto, o menu fica fixo na tela e ficaria longe do botão.
  useEffect(() => {
    if (!aberto) return;
    const aoTocarFora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      ref.current?.querySelector<HTMLElement>("button, a")?.focus();
    };
    const aoMover = (e: Event) => {
      if (e.type === "scroll" && menu.current?.contains(e.target as Node)) return; // a própria lista rolando
      setAberto(false);
    };
    // Captura: outros menus e cartões param o pointerdown na bolha; aqui ele é visto antes.
    document.addEventListener("pointerdown", aoTocarFora, true);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoMover, { capture: true, passive: true });
    window.addEventListener("resize", aoMover);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora, true);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoMover, { capture: true });
      window.removeEventListener("resize", aoMover);
    };
  }, [aberto]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {trigger({ aberto, alternar: () => setAberto((a) => !a) })}
      <div
        ref={menu}
        popover="manual"
        role="menu"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) setAberto(false);
        }}
        className="painel fixed m-0 max-h-[60vh] min-w-52 flex-col overflow-y-auto border-0 p-1.5 text-texto [inset:auto] open:flex open:animate-[entrar_220ms_var(--ease-raion)_both]"
      >
        {children}
      </div>
    </div>
  );
}

export function ItemMenuSuspenso({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" role="menuitem" className={CLASSE_ITEM_MENU} {...props}>
      {children}
    </button>
  );
}

export function RotuloMenuSuspenso({ children }: { children: ReactNode }) {
  return <p className="sobretitulo px-3 pt-2 pb-1 text-[10px]">{children}</p>;
}

export function SeparadorMenuSuspenso() {
  return <div role="separator" className="mx-2 my-1 border-t border-linha" />;
}
