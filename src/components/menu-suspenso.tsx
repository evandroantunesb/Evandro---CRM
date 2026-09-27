"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Menu suspenso genérico: fecha ao clicar fora ou num item. Usado pelo "Mover para" e outros menus de card. */
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

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {trigger({ aberto, alternar: () => setAberto((a) => !a) })}
      {aberto && (
        <div
          role="menu"
          onClick={() => setAberto(false)}
          className={`absolute z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg ${
            alinhamento === "direita" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ItemMenuSuspenso({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

export function RotuloMenuSuspenso({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">{children}</p>;
}
