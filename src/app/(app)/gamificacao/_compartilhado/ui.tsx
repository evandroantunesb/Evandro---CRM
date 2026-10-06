import type { ComponentType, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, Undo2 } from "lucide-react";

/** Ícone Lucide (ou compatível) aceito pelos componentes do módulo. */
export type IconeGf = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const TOM_ICONE = {
  verde: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  dourado: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  vermelho: "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]",
} as const;

export type TomIconeGf = keyof typeof TOM_ICONE;

const COR_ICONE_SOLTO = {
  verde: "text-[var(--gf-verde)]",
  dourado: "text-[var(--gf-dourado)]",
  neutro: "text-[var(--gf-texto-sec)]",
  vermelho: "text-[var(--gf-vermelho)]",
} as const;

/** Formata um inteiro com separador de milhar pt-BR. */
export function formatarNumeroGf(n: number) {
  return n.toLocaleString("pt-BR");
}

/** Valor com sinal explícito: "+1.250" / "−300" (sinal de menos tipográfico) / "0". Nunca depende só de cor. */
export function formatarSinal(n: number) {
  if (n > 0) return `+${formatarNumeroGf(n)}`;
  if (n < 0) return `−${formatarNumeroGf(-n)}`;
  return "0";
}

// ---------------------------------------------------------------------------
// Estrutura de página
// ---------------------------------------------------------------------------

const LARGURA_PAGINA = {
  /** Formulários administrativos: leitura confortável sem esticar campos. */
  formulario: "max-w-4xl",
  media: "max-w-5xl",
  larga: "max-w-[1280px]",
} as const;

/** Coluna de conteúdo da página: largura máxima por tipo de tela, centralizada, com espaçamento padrão. */
export function PaginaGf({
  children,
  largura = "media",
  className = "",
}: {
  children: ReactNode;
  largura?: keyof typeof LARGURA_PAGINA;
  className?: string;
}) {
  return (
    <div className={`mx-auto flex w-full min-w-0 flex-col gap-5 ${LARGURA_PAGINA[largura]} ${className}`}>
      {children}
    </div>
  );
}

/** Cabeçalho de página: título (h1), descrição curta opcional e uma ação/controle à direita. */
export function CabecalhoPaginaGf({
  titulo,
  descricao,
  acao,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="gf-t-pagina">{titulo}</h1>
        {descricao && <p className="gf-t-aux mt-1.5 max-w-3xl text-sm text-pretty">{descricao}</p>}
      </div>
      {acao && <div className="min-w-0 sm:shrink-0">{acao}</div>}
    </header>
  );
}

/** Agrupador de seção dentro de uma página (título + descrição + conteúdo), ex.: grupos da Administração. */
export function SecaoGf({
  titulo,
  descricao,
  Icone,
  tom = "verde",
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  Icone?: IconeGf;
  tom?: TomIconeGf;
  children: ReactNode;
}) {
  const id = `gf-secao-${titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="gf-t-secao flex items-center gap-2">
          {Icone && <Icone size={18} className={`shrink-0 ${COR_ICONE_SOLTO[tom]}`} aria-hidden />}
          {titulo}
        </h2>
        {descricao && <p className="gf-t-aux max-w-3xl text-sm text-pretty">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Link de ação do cabeçalho de um cartão ("Ver completo", "Ver loja"...): texto + seta. */
export function LinkAcaoGf({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-[var(--gf-verde)] hover:underline"
    >
      {children}
      <ArrowRight size={14} aria-hidden />
    </Link>
  );
}

/** Link discreto de retorno (ex.: telas internas da Administração voltam ao hub). */
export function VoltarGf({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-[var(--gf-texto-sec)] hover:text-[var(--gf-texto)]"
    >
      <ArrowLeft size={14} aria-hidden />
      {children}
    </Link>
  );
}

/**
 * Seletor segmentado baseado em links (filtros que mudam a URL: perfil, período).
 * `aria-current="page"` na opção ativa; o ativo também ganha peso e fundo (não só cor).
 */
export function SeletorSegmentadoGf({
  rotulo,
  opcoes,
}: {
  rotulo: string;
  opcoes: { href: string; rotulo: string; ativo: boolean }[];
}) {
  return (
    <nav
      aria-label={rotulo}
      className="flex w-fit max-w-full gap-1 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-1"
    >
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.ativo ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-md px-3.5 text-sm whitespace-nowrap transition-colors ${
            o.ativo
              ? "bg-[var(--gf-verde-10)] font-semibold text-[var(--gf-verde)] ring-1 ring-[var(--gf-verde-borda)]"
              : "text-[var(--gf-texto-sec)] hover:bg-[var(--gf-surface-alta)] hover:text-[var(--gf-texto)]"
          }`}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Cartões, selos, KPIs
// ---------------------------------------------------------------------------

/**
 * Cartão-base do tema escuro da Gamificação — mesma API do `Cartao` global
 * (src/components/ui.tsx). `destaque` eleva a superfície (--gf-surface-alta) e
 * aumenta levemente o respiro, pra separar informação principal de secundária
 * sem glow/neon — só os tokens de superfície/borda já existentes.
 *
 * Extensões opcionais: `Icone`/`tomIcone` desenham o ícone antes do título (verde =
 * desempenho, dourado = prestígio/recompensa) e `descricao` uma linha de apoio.
 * Títulos quebram linha em vez de truncar.
 */
export function CartaoGf({
  titulo,
  children,
  acao,
  className = "",
  destaque = false,
  style,
  Icone,
  tomIcone = "verde",
  descricao,
}: {
  titulo?: ReactNode;
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
  destaque?: boolean;
  style?: CSSProperties;
  Icone?: IconeGf;
  tomIcone?: TomIconeGf;
  descricao?: ReactNode;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-xl border border-[var(--gf-borda)] shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${
        destaque ? "bg-[var(--gf-surface-alta)] p-4 sm:p-5" : "bg-[var(--gf-surface)] p-4 sm:p-5"
      } ${className}`}
      style={style}
    >
      {(titulo || acao) && (
        <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
          {titulo && (
            <div className="min-w-0">
              <h2 className="gf-t-secao flex min-w-0 items-center gap-2">
                {Icone && <Icone size={18} className={`shrink-0 ${COR_ICONE_SOLTO[tomIcone]}`} aria-hidden />}
                <span className="min-w-0">{titulo}</span>
              </h2>
              {descricao && <p className="gf-t-aux mt-0.5">{descricao}</p>}
            </div>
          )}
          {acao && <div className="shrink-0 pt-0.5 whitespace-nowrap">{acao}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TOM_BADGE_GF = {
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)] ring-[var(--gf-borda)]",
  positivo: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)] ring-[var(--gf-verde-borda)]",
  negativo: "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)] ring-[rgb(248_113_113/35%)]",
  atencao: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)] ring-[var(--gf-dourado-borda)]",
} as const;

/**
 * Chip/badge do tema escuro — mesmos 4 tons do `Selo` global, remapeados pra verde/dourado/vermelho.
 * `Icone` opcional: o estado deve ser legível também sem cor (texto + ícone).
 */
export function BadgeGf({
  children,
  tom = "neutro",
  Icone,
}: {
  children: ReactNode;
  tom?: keyof typeof TOM_BADGE_GF;
  Icone?: IconeGf;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TOM_BADGE_GF[tom]}`}
    >
      {Icone && <Icone size={12} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Barra de progresso (role="progressbar"). `valor` em 0–100 e sempre limitado: acima de 100
 * a barra fica cheia (a superação é comunicada em texto por quem chama). Trilha com contraste
 * suficiente sobre o cartão.
 */
export function BarraProgressoGf({
  valor,
  rotulo,
  tom = "verde",
  tamanho = "md",
  className = "",
}: {
  valor: number;
  rotulo: string;
  tom?: "verde" | "dourado" | "neutro";
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pct = Number.isFinite(valor) ? Math.min(Math.max(valor, 0), 100) : 0;
  const cor = {
    verde: "bg-[var(--gf-verde)]",
    dourado: "bg-[var(--gf-dourado)]",
    neutro: "bg-[var(--gf-neutro-barra)]",
  }[tom];
  const altura = { sm: "h-1.5", md: "h-2", lg: "h-3" }[tamanho];
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`w-full overflow-hidden rounded-full bg-[var(--gf-trilha)] ${altura} ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Indicador de variação (seta + texto curto) — usado dentro de `KpiGf` e de
 * cartões maiores (ex.: "Minha posição") sempre que há uma comparação com um
 * ponto no passado. Ícone colorido + texto, com rótulo para leitores de tela.
 */
export function IndicadorKpiGf({ direcao, texto }: { direcao: "alta" | "baixa"; texto: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--gf-texto-sec)]">
      {direcao === "alta" ? (
        <ArrowUp size={12} className="text-[var(--gf-verde)]" aria-hidden />
      ) : (
        <ArrowDown size={12} className="text-[var(--gf-vermelho)]" aria-hidden />
      )}
      <span className="sr-only">{direcao === "alta" ? "Subiu " : "Caiu "}</span>
      {texto}
    </span>
  );
}

/**
 * KPI horizontal — ícone, valor e legenda. Valor em destaque (escala `gf-t-kpi-sm`), legenda
 * em microtexto que pode quebrar linha (nada de truncar em 9 px). `indicador` é livre (usar
 * `IndicadorKpiGf` pra variação com seta, ou qualquer outro texto/badge curto).
 */
export function KpiGf({
  Icone,
  valor,
  legenda,
  indicador,
  tom = "verde",
}: {
  Icone: ComponentType<{ size?: number; className?: string }>;
  valor: string;
  legenda: string;
  indicador?: ReactNode;
  tom?: "verde" | "dourado";
}) {
  return (
    <div className="flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:px-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TOM_ICONE[tom]}`}>
        <Icone size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="gf-t-kpi-sm whitespace-nowrap">{valor}</p>
          {indicador && <span>{indicador}</span>}
        </div>
        <p className="gf-t-micro mt-0.5">{legenda}</p>
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
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${TOM_INICIAIS_GF[tom]}`}
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.max(12, tamanho * 0.4),
        ...(tom === "dourado" ? { boxShadow: "inset 0 0 0 1.5px var(--gf-dourado-borda)" } : {}),
      }}
    >
      {inicial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Lançamentos / atividade
// ---------------------------------------------------------------------------

/**
 * Linha de lançamento (ícone + descrição + data + valores) — Extrato e "Atividade recente"
 * das Visões gerais. Entrada em verde com "+", saída/estorno em vermelho com "−": o sinal
 * acompanha sempre o número, então o sentido não depende só da cor. A descrição quebra
 * linha (até 2) em vez de truncar. `autor` (quem pontuou) vai em destaque antes da descrição.
 */
export function LinhaLancamento({
  descricao,
  tempo,
  xp,
  moedas,
  estornado = false,
  autor,
  Icone,
}: {
  descricao: ReactNode;
  tempo: string;
  xp?: number;
  moedas?: number;
  estornado?: boolean;
  autor?: string;
  /** Ícone fixo no lugar do padrão (+/−/estorno), ex.: raio de XP nas Visões gerais. */
  Icone?: IconeGf;
}) {
  const saida = (xp ?? 0) < 0 || (moedas ?? 0) < 0;
  const PadraoIcone = estornado ? Undo2 : saida ? Minus : Plus;
  const IconeLinha = Icone ?? PadraoIcone;
  const tomIcone = estornado
    ? "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-ter)]"
    : saida
      ? "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]"
      : "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]";

  function valor(n: number, unidade: string) {
    return (
      <span className="flex items-baseline justify-end gap-1 whitespace-nowrap">
        <span
          className={`gf-num text-sm font-semibold ${
            estornado ? "text-[var(--gf-texto-ter)] line-through" : n > 0 ? "text-[var(--gf-verde)]" : "text-[var(--gf-vermelho)]"
          }`}
        >
          {formatarSinal(n)}
        </span>
        <span className="text-xs text-[var(--gf-texto-sec)]">{unidade}</span>
      </span>
    );
  }

  return (
    <li className="flex items-start gap-3 border-t border-[var(--gf-borda)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tomIcone}`}>
        <IconeLinha size={15} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className={`line-clamp-2 text-sm leading-normal break-words ${
            estornado ? "text-[var(--gf-texto-ter)] line-through" : "text-[var(--gf-texto)]"
          }`}
        >
          {autor && <span className="font-semibold">{autor} · </span>}
          {descricao}
        </p>
        <p className="gf-t-micro">{tempo}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {xp !== undefined && xp !== 0 && valor(xp, "XP")}
        {moedas !== undefined && moedas !== 0 && valor(moedas, "moedas")}
        {estornado && <BadgeGf tom="negativo">Estornado</BadgeGf>}
      </div>
    </li>
  );
}

/**
 * Estado vazio padrão — ícone Lucide discreto (opcional) + texto, centralizado e
 * com respiro vertical pra não parecer um componente quebrado dentro do cartão.
 * `compacto` reduz o respiro — pra cartões que, com dados, viram listas/gráficos
 * altos (ranking, feed) e não devem reservar essa altura quando vazios.
 * `titulo` (linha em destaque) e `acao` (link/botão) tornam o estado vazio um
 * ponto de partida em vez de um beco sem saída.
 */
export function EstadoVazioGf({
  children,
  Icone,
  compacto = false,
  titulo,
  acao,
}: {
  children: ReactNode;
  Icone?: ComponentType<{ size?: number }>;
  compacto?: boolean;
  titulo?: string;
  acao?: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center text-center ${compacto ? "gap-2 py-4" : "gap-2.5 py-8"}`}
    >
      {Icone && (
        <span
          className={`flex items-center justify-center rounded-full bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)] ${compacto ? "h-9 w-9" : "h-12 w-12"}`}
        >
          <Icone size={compacto ? 17 : 22} />
        </span>
      )}
      {titulo && <p className="gf-t-item">{titulo}</p>}
      <p className="gf-t-aux max-w-md text-pretty">{children}</p>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
