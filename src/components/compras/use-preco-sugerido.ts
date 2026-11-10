"use client";

import { useEffect, useState } from "react";
import { sugerirPrecoKit } from "@/lib/acoes/precificacao";
import type { AvisoPreco } from "@/lib/compras/precificacao-kit";
import type { ComponenteLinha } from "@/lib/kit-linhas";

/**
 * Preço de venda do kit pela tabela de preços (P4b), calculado no servidor a cada mudança do kit (espera 400 ms entre
 * mudanças). O servidor devolve só o preço e os avisos, nunca custo ou margem.
 */
export function usePrecoSugeridoKit(componentes: ComponenteLinha[]): { precoSugerido: number | null; avisosPreco: AvisoPreco[] } {
  const chave = JSON.stringify(componentes);
  const [estado, setEstado] = useState<{ chave: string; precoSugerido: number | null; avisosPreco: AvisoPreco[] }>({
    chave: "",
    precoSugerido: null,
    avisosPreco: [],
  });
  useEffect(() => {
    if (componentes.length === 0) return;
    let ativo = true;
    const t = setTimeout(() => {
      sugerirPrecoKit(JSON.parse(chave))
        .then((r) => ativo && setEstado({ chave, precoSugerido: r?.sugerido ?? null, avisosPreco: r?.avisos ?? [] }))
        .catch(() => ativo && setEstado({ chave, precoSugerido: null, avisosPreco: [] }));
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // `chave` resume `componentes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  // Enquanto a resposta do kit atual não chega (ou kit vazio), não há sugerido: nunca um preço de outro kit.
  return estado.chave === chave && componentes.length > 0 ? estado : { precoSugerido: null, avisosPreco: [] };
}
