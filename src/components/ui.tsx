import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/*
 * Componentes básicos nas cores por função (src/app/globals.css), válidos nos temas claro e escuro.
 * Ação principal = Dourado Solar com texto carvão. Alvo de toque ≥ 44 px no celular.
 */

export const FOCO = "outline-none focus-visible:ring-2 focus-visible:ring-dourado/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fundo";

export function Botao({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" }) {
  const estilos = {
    primario: "bg-acao text-sobre-acao hover:bg-acao-forte",
    secundario: "border border-linha bg-superficie text-texto hover:border-dourado",
    perigo: "border border-red-200 bg-superficie text-red-700 hover:bg-red-50",
  }[variante];
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,border-color,transform] duration-200 ease-raion active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 md:min-h-9 ${FOCO} ${estilos} ${className}`}
      {...props}
    />
  );
}

/** Aparência de campo de entrada (input, select, textarea) nas cores do tema. */
export const CLASSE_ENTRADA =
  "min-h-11 rounded-lg border border-linha bg-superficie px-3 py-2 text-texto outline-none transition-colors duration-200 ease-raion placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20 disabled:bg-superficie-2 disabled:text-texto-2 aria-invalid:border-erro md:min-h-10";

/** Campo com rótulo acima; `erro` aparece logo abaixo, é anunciado e liga o campo a ele (aria-describedby). */
export function Campo({
  rotulo,
  erro,
  "aria-describedby": descritoPor,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string | null }) {
  const idErro = erro ? `${props.id ?? props.name ?? "campo"}-erro` : undefined;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-texto-2">{rotulo}</span>
      <input
        className={CLASSE_ENTRADA}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[descritoPor, idErro].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {erro && (
        <span id={idErro} role="alert" className="text-xs text-erro">
          {erro}
        </span>
      )}
    </label>
  );
}

export function Selecao({
  rotulo,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string; children: ReactNode }) {
  const select = (
    <select className={`${CLASSE_ENTRADA} text-sm`} {...props}>
      {children}
    </select>
  );
  if (!rotulo) return select;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-texto-2">{rotulo}</span>
      {select}
    </label>
  );
}

/** Link discreto de retorno, acima do título (ex.: telas de configuração voltam ao hub). */
export function Voltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`-ml-1 inline-flex min-h-11 w-fit items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-texto-2 transition-colors hover:text-texto md:min-h-0 ${FOCO}`}
    >
      <ChevronLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}

export function Mensagem({ resultado }: { resultado: { ok: boolean; mensagem: string } | null }) {
  if (!resultado) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
    >
      {resultado.mensagem}
    </p>
  );
}

export function Cartao({
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
    <section className={`painel p-5 md:p-6 ${className}`}>
      {(titulo || acao) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-lg font-semibold tracking-tight text-texto">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Cartão que mostra e esconde o conteúdo (`<details>` nativo: abre e fecha sem JavaScript). Fechado,
 * mostra o título e o `resumo` numa linha, para a página ficar curta.
 */
export function CartaoRecolhivel({
  titulo,
  resumo,
  aberto = false,
  children,
}: {
  titulo: string;
  resumo?: ReactNode;
  aberto?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="painel">
      <details open={aberto} className="group">
        <summary
          className={`flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden ${FOCO}`}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-texto">{titulo}</h2>
            {resumo && <p className="mt-0.5 text-sm text-texto-2">{resumo}</p>}
          </div>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-texto-2 transition-transform duration-200 ease-raion group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 md:px-6 md:pb-6">{children}</div>
      </details>
    </section>
  );
}

export function Selo({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "positivo" | "negativo" | "atencao" }) {
  const estilos = {
    neutro: "bg-zinc-100 text-zinc-700",
    positivo: "bg-green-100 text-green-800",
    negativo: "bg-red-100 text-red-800",
    atencao: "bg-amber-100 text-amber-800",
  }[tom];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>{children}</span>;
}

/**
 * Escolha única entre poucas opções (≤ 5), em botões em vez de lista: cada um anuncia se está marcado
 * (aria-pressed). Com `name`, o valor escolhido também vai no envio do formulário.
 */
export function GrupoOpcoes<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
  name,
  idErro,
}: {
  rotulo: string;
  opcoes: readonly { valor: T; rotulo: string }[];
  valor: T | null;
  aoEscolher: (valor: T) => void;
  name?: string;
  /** Id da mensagem de erro do grupo (aria-describedby), quando houver. */
  idErro?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} aria-describedby={idErro} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => aoEscolher(o.valor)}
          className={`min-h-11 rounded-full border border-linha px-4 text-sm text-texto transition-[background-color,border-color,transform] duration-200 ease-raion hover:border-texto-2 active:scale-[0.97] aria-pressed:border-dourado aria-pressed:bg-dourado/15 aria-pressed:font-semibold ${FOCO}`}
        >
          {o.rotulo}
        </button>
      ))}
      {name && <input type="hidden" name={name} value={valor ?? ""} />}
    </div>
  );
}

/** Quantidade com − e + (alvos de 44 px); o número é anunciado quando muda. */
export function Passador({
  valor,
  aoMudar,
  minimo = 1,
  maximo,
  rotulo,
}: {
  valor: number;
  aoMudar: (valor: number) => void;
  minimo?: number;
  maximo?: number;
  /** O que está sendo contado, para os rótulos dos botões ("módulos"). */
  rotulo: string;
}) {
  const botao = `grid h-11 w-11 place-items-center rounded-full border border-linha text-lg text-texto transition-colors duration-200 ease-raion hover:bg-superficie-2 disabled:opacity-40 ${FOCO}`;
  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" className={botao} aria-label={`Menos ${rotulo}`} disabled={valor <= minimo} onClick={() => aoMudar(Math.max(minimo, valor - 1))}>
        −
      </button>
      <output aria-live="polite" className="min-w-8 text-center font-semibold tabular-nums">
        {valor}
      </output>
      <button
        type="button"
        className={botao}
        aria-label={`Mais ${rotulo}`}
        disabled={maximo != null && valor >= maximo}
        onClick={() => aoMudar(maximo != null ? Math.min(maximo, valor + 1) : valor + 1)}
      >
        +
      </button>
    </div>
  );
}
