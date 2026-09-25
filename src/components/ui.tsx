import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Botao({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" }) {
  const estilos = {
    primario: "bg-amber-500 text-white hover:bg-amber-600",
    secundario: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
    perigo: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variante];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    />
  );
}

export function Campo({
  rotulo,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{rotulo}</span>
      <input
        className="rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        {...props}
      />
    </label>
  );
}

export function Selecao({
  rotulo,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string; children: ReactNode }) {
  const select = (
    <select
      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500"
      {...props}
    >
      {children}
    </select>
  );
  if (!rotulo) return select;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{rotulo}</span>
      {select}
    </label>
  );
}

export function Mensagem({ resultado }: { resultado: { ok: boolean; mensagem: string } | null }) {
  if (!resultado) return null;
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
    >
      {resultado.mensagem}
    </p>
  );
}

export function Cartao({ titulo, children, acao }: { titulo?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold text-zinc-900">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
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
