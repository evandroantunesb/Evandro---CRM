"use client";

import { useEffect, useRef, useState } from "react";
import { resolverDistribuidoraPorCidadeUf } from "@/lib/acoes/distribuidoras";
import {
  registrarEscolhaDistribuidora,
  type CamposDistribuidoraDimensionamento,
  type EscolhaManualDistribuidora,
  type ResolucaoDistribuidora,
} from "@/lib/distribuidoras";

export type UsarResolucaoDistribuidoraResultado = {
  /** `null` enquanto não há cidade/UF suficientes ou a busca ainda não terminou. */
  resolucao: ResolucaoDistribuidora | null;
  carregando: boolean;
  /** Campos prontos pra gravar no dimensionamento (sigla/nome/origem) — reflete a escolha manual
   * registrada via `registrarEscolha`, quando houver, senão a resolução automática. */
  camposDistribuidora: CamposDistribuidoraDimensionamento;
  /** Registra a escolha manual do vendedor quando a resolução é "ambígua" ou "não encontrada". */
  registrarEscolha: (escolha: EscolhaManualDistribuidora) => void;
};

/**
 * Resolução de distribuidora por município (Fase 2: `resolverDistribuidoraPorCidadeUf`, em
 * `src/lib/acoes/distribuidoras.ts`) pra cidade/UF digitadas no wizard. Devolve o resultado
 * tipado (única/ambígua/não encontrada), estado de carregamento, e a função pra registrar a
 * escolha manual do vendedor quando a resolução não decide sozinha — usando
 * `registrarEscolhaDistribuidora` (`src/lib/distribuidoras.ts`, Fase 2) como única fonte da
 * conversão pra campos de persistência, igual ao motor de dimensionamento.
 */
export function useResolucaoDistribuidora(cidade: string | undefined, uf: string | undefined): UsarResolucaoDistribuidoraResultado {
  const cidadeLimpa = cidade?.trim() ?? "";
  const ufLimpa = (uf?.trim() ?? "").toUpperCase();
  const prontaPraBuscar = !!cidadeLimpa && ufLimpa.length === 2;
  const chaveAtual = `${cidadeLimpa}|${ufLimpa}`;

  // Cidade/UF mudaram desde o último render: reseta a resolução (e a escolha manual, que não se
  // aplica mais a uma cidade diferente) já durante a renderização, sem precisar de um efeito só
  // pra isso — mesmo padrão de `useProdutividadeRegional`.
  const [chaveAnterior, setChaveAnterior] = useState(chaveAtual);
  const [resolucao, setResolucao] = useState<ResolucaoDistribuidora | null>(null);
  const [carregando, setCarregando] = useState(prontaPraBuscar);
  const [escolhaManual, setEscolhaManual] = useState<EscolhaManualDistribuidora | undefined>(undefined);
  if (chaveAtual !== chaveAnterior) {
    setChaveAnterior(chaveAtual);
    setResolucao(null);
    setCarregando(prontaPraBuscar);
    setEscolhaManual(undefined);
  }

  const buscaAtualRef = useRef(0);

  useEffect(() => {
    if (!prontaPraBuscar) return;
    const idDestaBusca = ++buscaAtualRef.current;
    resolverDistribuidoraPorCidadeUf(cidadeLimpa, ufLimpa)
      .then((resultado) => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setResolucao(resultado);
      })
      .catch(() => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setResolucao({ tipo: "nao_encontrada" });
      })
      .finally(() => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setCarregando(false);
      });
  }, [cidadeLimpa, ufLimpa, prontaPraBuscar]);

  const camposDistribuidora = registrarEscolhaDistribuidora(resolucao ?? { tipo: "nao_encontrada" }, escolhaManual);

  return {
    resolucao,
    carregando,
    camposDistribuidora,
    registrarEscolha: setEscolhaManual,
  };
}
