"use client";

import { useEffect, useRef, useState } from "react";
import type { ResultadoCalculoCompleto } from "@/lib/calculadora";
import { autonomia, carbonoEvitadoKgAno, FATOR_EMISSAO_SIN } from "@/lib/impacto";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");

/** Número que desliza até o novo valor (sem animação para quem pede menos movimento). */
function useNumeroAnimado(alvo: number) {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const inicio = atual.current;
    if (inicio === alvo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    const t0 = performance.now();
    let quadro = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      const suave = 1 - (1 - p) ** 3;
      atual.current = inicio + (alvo - inicio) * suave;
      setValor(atual.current);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return valor;
}

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string | null; destaque?: boolean }) {
  return (
    <div>
      <dt className="mb-1 text-xs text-texto-2">{rotulo}</dt>
      <dd className={`font-titulo text-xl font-semibold tabular-nums ${destaque && valor ? "text-energia" : "text-texto"}`}>{valor ?? "—"}</dd>
    </div>
  );
}

/**
 * Resultado ao vivo do cadastro: o mesmo `calcular()` que o servidor grava. Completo → autonomia, economia, conta com
 * solar, geração e carbono evitado. Incompleto → geração e a lista honesta do que falta (nenhum número presumido).
 */
export function PainelResultado({
  nomeCliente,
  consumoKwh,
  geracao,
  completo,
  pendencias,
  faltaBasico,
  fonte,
}: {
  nomeCliente: string;
  consumoKwh: number | null;
  /** Geração estimada do kit (kWh/mês); null sem kit. */
  geracao: number | null;
  /** Resultado completo do motor (conta e economia); null enquanto houver pendência. */
  completo: ResultadoCalculoCompleto | null;
  /** O que falta para o resultado completo (mensagens do motor e da tela). */
  pendencias: string[];
  /** O que falta para haver qualquer resultado (consumo, kit). */
  faltaBasico: string | null;
  /** Origem da tarifa e da regra, quando o cálculo é completo. */
  fonte: string | null;
}) {
  const fracao = geracao != null && consumoKwh != null ? autonomia(geracao, consumoKwh) : null;
  const pct = useNumeroAnimado(fracao != null ? Math.round(fracao * 100) : 0);
  const economia = useNumeroAnimado(completo?.economiaMensal ?? 0);
  const carbono = geracao != null ? carbonoEvitadoKgAno(geracao) : null;
  const raio = 42;
  const volta = 2 * Math.PI * raio;

  return (
    <section aria-label="Resultado" className="overflow-hidden rounded-3xl bg-superficie shadow-[0_24px_60px_-20px_rgb(15_15_16/0.25)] ring-1 ring-linha">
      <div
        aria-hidden
        className="h-32 bg-[linear-gradient(180deg,transparent_30%,var(--color-superficie)_100%),url(/marca/paisagem.jpg)] bg-cover bg-[center_62%]"
      />
      <div className="relative -mt-10 px-6 pb-6 md:px-7">
        <p className="sobretitulo">Resultado</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-texto">
          {nomeCliente.trim() ? `A propriedade de ${nomeCliente.trim().split(/\s+/)[0]}` : "A propriedade do cliente"}
        </h2>

        <div className="mt-4 flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={raio} fill="none" strokeWidth="6" className="stroke-linha" />
            <circle
              cx="50"
              cy="50"
              r={raio}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className="stroke-dourado transition-[stroke-dashoffset] duration-900 ease-raion"
              strokeDasharray={volta}
              strokeDashoffset={volta * (1 - (fracao ?? 0))}
            />
          </svg>
          <div aria-live="polite">
            <p className="font-titulo text-5xl leading-none font-light tabular-nums text-texto">{fracao != null ? `${Math.round(pct)}%` : "—"}</p>
            <p className="mt-1 text-sm text-texto-2">autonomia da propriedade</p>
          </div>
        </div>

        {faltaBasico ? (
          <p className="mt-6 border-t border-linha pt-5 text-sm text-texto-2">{faltaBasico}</p>
        ) : (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-linha pt-5">
              <Metrica rotulo="Economia por mês" valor={completo ? moeda(economia) : null} destaque />
              <Metrica rotulo="Conta com solar" valor={completo ? moeda(completo.contaComSolar) : null} />
              <Metrica rotulo="Geração" valor={geracao != null ? `${inteiro(geracao)} kWh/mês` : null} />
              <Metrica rotulo="Carbono evitado" valor={carbono != null ? `${inteiro(carbono)} kg/ano` : null} />
            </dl>
            {!completo && pendencias.length > 0 && (
              <div className="mt-5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
                <p className="font-medium text-texto">Para calcular conta e economia, falta:</p>
                <ul className="mt-1 list-disc pl-5 text-texto-2">
                  {pendencias.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="mt-5 text-[11px] leading-relaxed text-texto-2">
          {fonte ? `${fonte} · ` : ""}Carbono: {FATOR_EMISSAO_SIN.fonte} ({FATOR_EMISSAO_SIN.ano}). A conta nunca zera: fica a taxa
          mínima da ligação.
        </p>
      </div>
    </section>
  );
}
