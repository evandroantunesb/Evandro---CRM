"use client";

import { useState } from "react";
import { formatarMoeda } from "@/lib/formatacao";

type Ponto = { dia: number; valor: number };

/** Gráfico de área com tooltip, no mesmo estilo dos gráficos SVG do dashboard de Gamificação. */
export function GraficoDesempenho({ acumulado, meta }: { acumulado: Ponto[]; meta: Ponto[] | null }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const largura = 100;
  const altura = 40;
  const maxValor = Math.max(1, ...acumulado.map((p) => p.valor), ...(meta ?? []).map((p) => p.valor));
  const passoX = acumulado.length > 1 ? largura / (acumulado.length - 1) : largura;
  const x = (i: number) => i * passoX;
  const y = (v: number) => altura - (v / maxValor) * altura;

  const linha = acumulado.map((p, i) => `${x(i).toFixed(2)},${y(p.valor).toFixed(2)}`).join(" ");
  const area = `0,${altura} ${linha} ${x(acumulado.length - 1).toFixed(2)},${altura}`;
  const linhaMeta = meta?.length ? meta.map((p, i) => `${x(i).toFixed(2)},${y(p.valor).toFixed(2)}`).join(" ") : null;

  const ponto = ativo != null ? acumulado[ativo] : null;

  return (
    <div className="relative mt-2">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="none"
        className="h-40 w-full touch-none"
        onMouseLeave={() => setAtivo(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const fracao = (e.clientX - rect.left) / rect.width;
          const i = Math.round(fracao * (acumulado.length - 1));
          setAtivo(Math.max(0, Math.min(acumulado.length - 1, i)));
        }}
      >
        <polygon points={area} fill="var(--color-dourado)" opacity={0.12} />
        {linhaMeta && (
          <polyline
            points={linhaMeta}
            fill="none"
            stroke="var(--color-zinc-400)"
            strokeWidth="0.6"
            strokeDasharray="2,2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline points={linha} fill="none" stroke="var(--color-dourado)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {ativo != null && (
          <line x1={x(ativo)} x2={x(ativo)} y1={0} y2={altura} stroke="var(--color-zinc-300)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        )}
        {acumulado.map((p, i) => (
          <circle
            key={p.dia}
            cx={x(i)}
            cy={y(p.valor)}
            r={ativo === i ? 1.6 : 0}
            fill="var(--color-dourado)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {ponto && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap text-zinc-700 shadow-md"
          style={{ left: `${(x(ativo!) / largura) * 100}%` }}
        >
          <span className="font-medium text-zinc-900">Dia {ponto.dia}</span> · {formatarMoeda(ponto.valor)}
        </div>
      )}
    </div>
  );
}
