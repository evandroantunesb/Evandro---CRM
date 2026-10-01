"use client";

import { useEffect, useRef, useState } from "react";
import { buscarProdutividadeRegionalPorEndereco } from "@/lib/acoes/geodados";

const ATRASO_DEBOUNCE_MS = 650;

export type ResultadoProdutividadeRegional = {
  produtividade: number | null;
  fonte: "pvgis" | "nasa" | null;
  carregando: boolean;
  erro: string | null;
};

const RESULTADO_VAZIO: ResultadoProdutividadeRegional = { produtividade: null, fonte: null, carregando: false, erro: null };

/**
 * Produtividade solar real (PVGIS/NASA) pro endereço informado na Etapa 1/2 do wizard, buscada
 * via `buscarProdutividadeRegionalPorEndereco` (`src/lib/acoes/geodados.ts`, Fase 1/2) com debounce
 * — evita disparar a busca a cada tecla enquanto o vendedor ainda está digitando o endereço.
 *
 * Sem fallback silencioso: quando o endereço está vazio, a busca falha ou não encontra nada,
 * devolve `produtividade: null` — quem consome decide o que mostrar no lugar (ex.: usar a
 * produtividade média configurada da empresa), nunca este hook (Evandro, 2026-10-01).
 */
export function useProdutividadeRegional(endereco: string | undefined): ResultadoProdutividadeRegional {
  const enderecoLimpo = endereco?.trim() ?? "";

  // Endereço mudou desde o último render: reseta o resultado já durante a renderização (padrão
  // do React pra "resetar estado quando uma prop muda" — evita precisar de um efeito só pra
  // isso, e evita mostrar por um instante o resultado do endereço anterior).
  const [chaveAnterior, setChaveAnterior] = useState(enderecoLimpo);
  const [resultado, setResultado] = useState<ResultadoProdutividadeRegional>(
    enderecoLimpo ? { ...RESULTADO_VAZIO, carregando: true } : RESULTADO_VAZIO,
  );
  if (enderecoLimpo !== chaveAnterior) {
    setChaveAnterior(enderecoLimpo);
    setResultado(enderecoLimpo ? { ...RESULTADO_VAZIO, carregando: true } : RESULTADO_VAZIO);
  }

  // Descarta a resposta de uma busca anterior (endereço já mudou de novo) — evita que uma busca
  // lenta sobrescreva o resultado de uma busca mais nova que já respondeu.
  const buscaAtualRef = useRef(0);

  useEffect(() => {
    if (!enderecoLimpo) return;
    const idDestaBusca = ++buscaAtualRef.current;

    const temporizador = setTimeout(async () => {
      try {
        const regional = await buscarProdutividadeRegionalPorEndereco(enderecoLimpo);
        if (buscaAtualRef.current !== idDestaBusca) return; // uma busca mais nova já está em andamento
        if (!regional) {
          setResultado({
            produtividade: null,
            fonte: null,
            carregando: false,
            erro: "Não foi possível obter a produtividade solar desse endereço.",
          });
          return;
        }
        setResultado({ produtividade: regional.produtividadeKwhKwpMes, fonte: regional.fonte, carregando: false, erro: null });
      } catch {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setResultado({ produtividade: null, fonte: null, carregando: false, erro: "Falha ao buscar a produtividade solar." });
      }
    }, ATRASO_DEBOUNCE_MS);

    return () => clearTimeout(temporizador);
  }, [enderecoLimpo]);

  return resultado;
}
