"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const semAssinatura = () => () => {};

/** Distância mínima (px) e inclinação máxima do gesto horizontal para trocar de obra. */
const GESTO_MIN = 70;
const GESTO_MAX_VERTICAL = 45;

/**
 * Palco da Apresentação: tela cheia (quando o navegador permite) e, no toque, deslizar para os
 * lados troca de obra como slides. O gesto nunca vale dentro de áreas com rolagem própria
 * (`data-sem-gesto`, ex.: o Gantt) nem com mais de um dedo; a rolagem vertical segue normal.
 * As setas do teclado ficam na barra de navegação (NavegacaoObras).
 */
export function PalcoApresentacao({
  anteriorHref,
  proximaHref,
  barra,
  children,
}: {
  anteriorHref: string | null;
  proximaHref: string | null;
  barra: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const palco = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  // No servidor não há tela cheia; no navegador, depende do suporte (iOS no celular não tem).
  const suportaTelaCheia = useSyncExternalStore(
    semAssinatura,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === palco.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  const alternarTelaCheia = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await palco.current?.requestFullscreen();
    } catch {
      // Bloqueado pelo navegador (ex.: iframe, iOS): segue fora da tela cheia.
    }
  };

  return (
    <div
      ref={palco}
      className={`flex flex-col gap-4 ${telaCheia ? "h-screen overflow-y-auto bg-offwhite p-4 md:p-8" : ""}`}
      onTouchStart={(e) => {
        const alvo = e.target as HTMLElement;
        inicio.current = e.touches.length === 1 && !alvo.closest("[data-sem-gesto], input, select, textarea, a, button") ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      }}
      onTouchEnd={(e) => {
        const ini = inicio.current;
        inicio.current = null;
        if (!ini) return;
        const dx = e.changedTouches[0].clientX - ini.x;
        const dy = e.changedTouches[0].clientY - ini.y;
        if (Math.abs(dx) < GESTO_MIN || Math.abs(dy) > GESTO_MAX_VERTICAL) return;
        const destino = dx < 0 ? proximaHref : anteriorHref;
        if (destino) router.push(destino);
      }}
    >
      <div className="flex flex-col gap-2">
        {barra}
        {suportaTelaCheia && (
          <button
            type="button"
            onClick={alternarTelaCheia}
            className="hidden min-h-9 w-fit items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm text-carvao hover:border-dourado md:inline-flex"
          >
            {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          </button>
        )}
        <p className="text-xs text-zinc-500 md:hidden">Deslize para os lados para trocar de obra.</p>
      </div>
      {children}
    </div>
  );
}
