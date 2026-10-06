import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatarMoeda } from "@/lib/formatacao";
import { BadgeGf, BarraProgressoGf, type IconeGf } from "./ui";

export type UnidadeMetaGf = "moeda" | "quantidade" | "percentual";

/** Valor de uma meta na unidade da métrica (R$, quantidade ou %). */
export function formatarValorMeta(unidade: UnidadeMetaGf, valor: number) {
  if (unidade === "moeda") return formatarMoeda(valor);
  if (unidade === "percentual") return `${valor.toFixed(1)}%`;
  return Math.round(valor).toLocaleString("pt-BR");
}

type SituacaoMeta = { rotulo: string; tom: "positivo" | "negativo" | "neutro"; Icone: IconeGf };

/**
 * Situação de uma meta, só a partir do que já é calculado (percentual e dias restantes):
 * >= 100% é "Meta batida"; período acabado abaixo de 100% é "Período encerrado"; o resto é
 * "Em andamento". Sem regra nova de risco/projeção.
 */
export function situacaoMeta(percentual: number, diasRestantes: number): SituacaoMeta {
  if (percentual >= 100) return { rotulo: "Meta batida", tom: "positivo", Icone: CheckCircle2 };
  if (diasRestantes === 0) return { rotulo: "Período encerrado", tom: "negativo", Icone: XCircle };
  return { rotulo: "Em andamento", tom: "neutro", Icone: Clock };
}

export function SituacaoMetaGf({ percentual, diasRestantes }: { percentual: number; diasRestantes: number }) {
  const s = situacaoMeta(percentual, diasRestantes);
  return (
    <BadgeGf tom={s.tom} Icone={s.Icone}>
      {s.rotulo}
    </BadgeGf>
  );
}

/** "+18% acima da meta" quando o realizado passa de 100%; nada abaixo disso. */
export function SuperacaoMetaGf({ percentual }: { percentual: number }) {
  if (percentual <= 100) return null;
  return (
    <span className="text-xs font-semibold text-[var(--gf-verde)]">
      +{Math.round(percentual - 100)}% acima da meta
    </span>
  );
}

/**
 * Bloco de progresso de uma meta: barra (cheia a partir de 100%, nunca passa disso),
 * "realizado de alvo" e percentual em destaque, com indicação textual de superação.
 */
export function ProgressoMetaGf({
  rotulo,
  realizado,
  alvo,
  percentual,
}: {
  rotulo: string;
  realizado: string;
  alvo: string;
  percentual: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 text-sm text-[var(--gf-texto-sec)]">
          <span className="gf-num text-base font-semibold text-[var(--gf-texto)]">{realizado}</span> de{" "}
          <span className="gf-num">{alvo}</span>
        </p>
        <p className="gf-t-kpi-sm shrink-0">{percentual.toFixed(0)}%</p>
      </div>
      <BarraProgressoGf valor={percentual} rotulo={`${rotulo}: ${percentual.toFixed(0)}% da meta`} />
      <SuperacaoMetaGf percentual={percentual} />
    </div>
  );
}
