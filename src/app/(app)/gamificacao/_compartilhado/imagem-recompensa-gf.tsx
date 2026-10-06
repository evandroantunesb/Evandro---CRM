"use client";

import { useState, type ReactNode } from "react";

/**
 * Controla a imagem de uma recompensa que pode falhar ao carregar (URL assinada expirada,
 * arquivo removido). `url` é nula quando não há imagem ou quando ela já falhou; guardamos a
 * URL que falhou (e não um booleano) para que uma URL nova — após trocar a imagem — volte a
 * tentar sozinha.
 */
export function useImagemRecompensa(url: string | null | undefined) {
  const [falhou, setFalhou] = useState<string | null>(null);
  return { url: url && falhou !== url ? url : null, aoFalhar: () => setFalhou(url ?? null) };
}

/**
 * Imagem da recompensa (`object-cover`) dentro de uma caixa; sem imagem, ou se ela falhar ao
 * carregar, mostra `fallback` (o ícone atual). A proporção/tamanho vêm de `className`
 * (ex.: `aspect-[4/3] w-full` ou `h-9 w-12`). `alt` é o nome da recompensa.
 */
export function ImagemRecompensaGf({
  url,
  alt,
  className = "",
  fallback,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const imagem = useImagemRecompensa(url);
  if (!imagem.url) return <>{fallback}</>;
  return (
    <span className={`block shrink-0 overflow-hidden bg-[var(--gf-surface)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage; o otimizador do Next não se aplica */}
      <img
        src={imagem.url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={imagem.aoFalhar}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
