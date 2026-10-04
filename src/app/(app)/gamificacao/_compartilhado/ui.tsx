import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

/** Cartão-base do tema escuro da Gamificação — mesma API do `Cartao` global (src/components/ui.tsx). */
export function CartaoGf({
  titulo,
  children,
  acao,
  className = "",
}: {
  titulo?: string;
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${className}`}
    >
      {(titulo || acao) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold text-[var(--gf-texto)]">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

const TOM_BADGE_GF = {
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  positivo: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  negativo: "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]",
  atencao: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
} as const;

/** Badge do tema escuro — mesmos 4 tons do `Selo` global, remapeados pra verde/dourado/vermelho. */
export function BadgeGf({ children, tom = "neutro" }: { children: ReactNode; tom?: keyof typeof TOM_BADGE_GF }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TOM_BADGE_GF[tom]}`}>{children}</span>;
}

/** KPI numérico com ícone, valor e variação — usado na Visão geral e no Extrato. */
export function KpiGf({
  Icone,
  valor,
  legenda,
  variacaoPct,
}: {
  Icone: ComponentType<{ size?: number }>;
  valor: string;
  legenda: string;
  variacaoPct?: number | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gf-verde-10)] text-[var(--gf-verde)]">
          <Icone size={16} />
        </span>
        {variacaoPct != null && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              variacaoPct >= 0 ? "text-[var(--gf-verde)]" : "text-[var(--gf-vermelho)]"
            }`}
          >
            {variacaoPct >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(variacaoPct).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="truncate text-xl font-semibold text-[var(--gf-texto)]">{valor}</p>
      <p className="text-xs text-[var(--gf-texto-sec)]">{legenda}</p>
    </div>
  );
}

/** Linha de lançamento (data + descrição + valor colorido) — Extrato e "Atividade recente" da Visão geral. */
export function LinhaLancamento({
  descricao,
  tempo,
  xp,
  moedas,
  estornado = false,
}: {
  descricao: ReactNode;
  tempo: string;
  xp?: number;
  moedas?: number;
  estornado?: boolean;
}) {
  function valor(n: number) {
    if (n === 0) return null;
    return (
      <span
        className={`font-medium ${estornado ? "text-[var(--gf-texto-ter)] line-through" : n >= 0 ? "text-[var(--gf-verde)]" : "text-[var(--gf-vermelho)]"}`}
      >
        {n >= 0 ? "+" : ""}
        {n}
      </span>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 border-t border-[var(--gf-borda)] py-2 text-sm first:border-t-0">
      <div className="flex flex-col">
        <span className={estornado ? "text-[var(--gf-texto-ter)] line-through" : "text-[var(--gf-texto)]"}>{descricao}</span>
        <span className="text-xs text-[var(--gf-texto-sec)]">{tempo}</span>
      </div>
      <div className="flex items-center gap-2">
        {estornado && <BadgeGf tom="negativo">Estornado</BadgeGf>}
        {xp !== undefined && xp !== 0 && (
          <span className="flex items-baseline gap-1">
            {valor(xp)}
            <span className="text-xs text-[var(--gf-texto-ter)]">XP</span>
          </span>
        )}
        {moedas !== undefined && moedas !== 0 && (
          <span className="flex items-baseline gap-1">
            {valor(moedas)}
            <span className="text-xs text-[var(--gf-texto-ter)]">moedas</span>
          </span>
        )}
      </div>
    </li>
  );
}

/** Estado vazio padrão — substitui os <p> soltos de "nenhum dado ainda" espalhados pelas telas. */
export function EstadoVazioGf({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--gf-texto-sec)]">{children}</p>;
}
