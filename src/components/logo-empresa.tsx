"use client";

import { useState } from "react";
import { LogoRaion } from "@/components/marca";

/**
 * Logo da empresa na barra (URL assinada do Storage, que expira e muda a cada página). Se a imagem não carregar, cai no
 * logo do Raion, como quando a empresa não tem logo, em vez de mostrar a imagem quebrada.
 */
export function LogoEmpresa({ url, nome, altura }: { url: string; nome: string; altura: number }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <LogoRaion tom="claro" altura={altura} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, que muda a cada hora
    <img src={url} alt={nome} style={{ height: altura }} className="w-auto max-w-[180px] object-contain" onError={() => setFalhou(true)} />
  );
}
