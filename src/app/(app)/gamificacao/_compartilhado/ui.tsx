import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Cartão-base do tema escuro da Gamificação — mesma API do `Cartao` global
 * (src/components/ui.tsx). `destaque` eleva a superfície (--gf-surface-alta) e
 * aumenta levemente o respiro, pra separar informação principal de secundária
 * sem glow/neon — só os tokens de superfície/borda já existentes.
 */
export function CartaoGf({
  titulo,
  children,
  acao,
  className = "",
  destaque = false,
}: {
  titulo?: string;
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
  destaque?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--gf-borda)] shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${
        destaque ? "bg-[var(--gf-surface-alta)] p-6" : "bg-[var(--gf-surface)] p-5"
      } ${className}`}
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
export function BadgeGf({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: keyof typeof TOM_BADGE_GF;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TOM_BADGE_GF[tom]}`}
    >
      {children}
    </span>
  );
}

/**
 * Indicador de variação (seta + texto curto) — usado dentro de `KpiGf` e de
 * cartões maiores (ex.: "Minha posição") sempre que há uma comparação com um
 * ponto no passado. Só um ícone colorido + texto pequeno, pra não competir
 * visualmente com o valor principal.
 */
export function IndicadorKpiGf({ direcao, texto }: { direcao: "alta" | "baixa"; texto: string }) {
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-[var(--gf-texto-sec)]">
      {direcao === "alta" ? (
        <ArrowUp size={10} className="text-[var(--gf-verde)]" />
      ) : (
        <ArrowDown size={10} className="text-[var(--gf-vermelho)]" />
      )}
      {texto}
    </span>
  );
}

/**
 * KPI em formato de pílula horizontal — ícone, valor e indicador lado a lado.
 * Mais denso que um cartão de grade: pensado pra ficar junto do cabeçalho,
 * não ocupar uma linha inteira de altura própria. `indicador` é livre (usar
 * `IndicadorKpiGf` pra variação com seta, ou qualquer outro texto/badge curto).
 */
export function KpiGf({
  Icone,
  valor,
  legenda,
  indicador,
}: {
  Icone: ComponentType<{ size?: number }>;
  valor: string;
  legenda: string;
  indicador?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-[var(--gf-borda)] bg-[var(--gf-surface)] py-2 pr-4 pl-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--gf-verde-10)] text-[var(--gf-verde)]">
        <Icone size={15} />
      </span>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline gap-1.5">
          <p className="truncate text-sm font-semibold text-[var(--gf-texto)]">{valor}</p>
          {indicador}
        </div>
        <p className="truncate text-[11px] text-[var(--gf-texto-sec)]">{legenda}</p>
      </div>
    </div>
  );
}

const TOM_INICIAIS_GF = {
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  verde: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  dourado: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
} as const;

/**
 * Avatar-fallback consistente (iniciais sobre círculo colorido) — usado onde a
 * referência visual tem foto de perfil e o produto não tem upload de foto.
 * Nunca inventa uma imagem; só a inicial do nome.
 */
export function IniciaisAvatarGf({
  nome,
  tamanho = 32,
  tom = "neutro",
}: {
  nome: string;
  tamanho?: number;
  tom?: keyof typeof TOM_INICIAIS_GF;
}) {
  const inicial = nome.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${TOM_INICIAIS_GF[tom]}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(10, tamanho * 0.4) }}
    >
      {inicial}
    </span>
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
        <span
          className={
            estornado ? "text-[var(--gf-texto-ter)] line-through" : "text-[var(--gf-texto)]"
          }
        >
          {descricao}
        </span>
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

/**
 * Estado vazio padrão — ícone Lucide discreto (opcional) + texto, centralizado e
 * com respiro vertical pra não parecer um componente quebrado dentro do cartão.
 * `compacto` reduz ainda mais o respiro — pra cartões que, com dados, viram
 * listas/gráficos altos (ranking, feed, gráficos) e não devem reservar essa
 * altura quando vazios. Sem `compacto`, o padrão de sempre (ex.: Extrato) não muda.
 */
export function EstadoVazioGf({
  children,
  Icone,
  compacto = false,
}: {
  children: ReactNode;
  Icone?: ComponentType<{ size?: number }>;
  compacto?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 text-center ${compacto ? "py-2.5" : "py-6 gap-2"}`}
    >
      {Icone && (
        <span
          className={`flex items-center justify-center rounded-full bg-[var(--gf-surface-alta)] text-[var(--gf-texto-ter)] ${compacto ? "h-7 w-7" : "h-9 w-9"}`}
        >
          <Icone size={compacto ? 13 : 16} />
        </span>
      )}
      <p className={`text-[var(--gf-texto-sec)] ${compacto ? "text-xs" : "text-sm"}`}>{children}</p>
    </div>
  );
}
