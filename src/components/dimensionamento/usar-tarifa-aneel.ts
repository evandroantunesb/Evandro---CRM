"use client";

import { useEffect, useRef, useState } from "react";
import { buscarTarifaPorSigla } from "@/lib/acoes/aneel";

export type ResultadoTarifaAneel = {
  tarifa: number | null;
  origem: "aneel" | "manual" | null;
  vigenciaInicio: string | null;
  resolucaoHomologatoria: string | null;
  carregando: boolean;
  erro: string | null;
  /** Marca que o vendedor ajustou a tarifa manualmente — a partir daí o hook não sobrescreve
   * `tarifa`/`origem` mais, até `siglaDistribuidora` mudar de novo (o hook então volta a buscar
   * na ANEEL pra nova distribuidora). */
  marcarAjusteManual: (tarifaManual: number) => void;
};

/**
 * Tarifa homologada da ANEEL (`buscarTarifaPorSigla`, `src/lib/acoes/aneel.ts`, Fase 2) pra uma
 * sigla de distribuidora já resolvida (`useResolucaoDistribuidora`). Nunca inventa um valor:
 * enquanto não há sigla, ou a busca falha e não há tarifa manual registrada, `tarifa` fica `null`
 * e quem consome decide o que pedir ao vendedor (Evandro, 2026-10-01).
 */
export function useTarifaAneel(siglaDistribuidora: string | undefined): ResultadoTarifaAneel {
  const siglaLimpa = siglaDistribuidora?.trim() ?? "";

  // Sigla mudou desde o último render: reseta tarifa/origem (inclusive um ajuste manual anterior,
  // que valia só pra distribuidora antiga) já durante a renderização, sem precisar de um efeito
  // só pra isso — mesmo padrão dos outros hooks desta pasta.
  const [chaveAnterior, setChaveAnterior] = useState(siglaLimpa);
  const [tarifa, setTarifa] = useState<number | null>(null);
  const [origem, setOrigem] = useState<"aneel" | "manual" | null>(null);
  const [vigenciaInicio, setVigenciaInicio] = useState<string | null>(null);
  const [resolucaoHomologatoria, setResolucaoHomologatoria] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!!siglaLimpa);
  const [erro, setErro] = useState<string | null>(null);
  const [ajustadoManualmente, setAjustadoManualmente] = useState(false);
  if (siglaLimpa !== chaveAnterior) {
    setChaveAnterior(siglaLimpa);
    setTarifa(null);
    setOrigem(null);
    setVigenciaInicio(null);
    setResolucaoHomologatoria(null);
    setErro(null);
    setCarregando(!!siglaLimpa);
    setAjustadoManualmente(false);
  }

  const buscaAtualRef = useRef(0);

  useEffect(() => {
    if (ajustadoManualmente || !siglaLimpa) return;
    const idDestaBusca = ++buscaAtualRef.current;
    buscarTarifaPorSigla(siglaLimpa)
      .then((resultado) => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        if (!resultado) {
          setTarifa(null);
          setOrigem(null);
          setVigenciaInicio(null);
          setResolucaoHomologatoria(null);
          setErro("Não foi possível obter a tarifa homologada da ANEEL pra essa distribuidora.");
          return;
        }
        setTarifa(resultado.tarifaKwh);
        setOrigem("aneel");
        setVigenciaInicio(resultado.vigenciaInicio);
        setResolucaoHomologatoria(resultado.resolucaoHomologatoria);
        setErro(null);
      })
      .catch(() => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setTarifa(null);
        setOrigem(null);
        setVigenciaInicio(null);
        setResolucaoHomologatoria(null);
        setErro("Falha ao buscar a tarifa da ANEEL.");
      })
      .finally(() => {
        if (buscaAtualRef.current !== idDestaBusca) return;
        setCarregando(false);
      });
  }, [siglaLimpa, ajustadoManualmente]);

  function marcarAjusteManual(tarifaManual: number) {
    buscaAtualRef.current += 1; // invalida qualquer busca da ANEEL ainda em andamento
    setAjustadoManualmente(true);
    setTarifa(tarifaManual);
    setOrigem("manual");
    setVigenciaInicio(null);
    setResolucaoHomologatoria(null);
    setErro(null);
    setCarregando(false);
  }

  return { tarifa, origem, vigenciaInicio, resolucaoHomologatoria, carregando, erro, marcarAjusteManual };
}
