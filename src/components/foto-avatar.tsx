"use client";

import { useState, type ReactNode } from "react";

/**
 * Foto redonda (`object-cover`) de uma pessoa. Sem `src`, ou se a imagem falhar ao carregar (URL
 * assinada expirada, arquivo removido), mostra `fallback` (as iniciais de quem chamou). Guarda a
 * URL que falhou (e não um booleano) para que uma URL nova volte a tentar sozinha.
 */
export function FotoAvatar({
  src,
  alt,
  tamanho,
  fallback,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  tamanho: number;
  fallback: ReactNode;
  className?: string;
}) {
  const [falhou, setFalhou] = useState<string | null>(null);
  if (!src || falhou === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage; o otimizador do Next não se aplica
    <img
      src={src}
      alt={alt}
      title={alt || undefined}
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(src)}
      style={{ width: tamanho, height: tamanho }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
