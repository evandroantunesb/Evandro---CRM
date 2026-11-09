import Link from "next/link";
import { FOCO } from "@/components/ui";

/** "Pedidos | Tabela de preços" no topo de Compras (desenho aprovado "Tabela de preços"). */
export function AbasCompras({ atual }: { atual: "pedidos" | "precos" }) {
  const abas = [
    { valor: "pedidos", rotulo: "Pedidos", href: "/compras" },
    { valor: "precos", rotulo: "Tabela de preços", href: "/compras/precos" },
  ] as const;
  return (
    <nav aria-label="Compras" className="flex w-fit gap-1 rounded-full border border-linha bg-superficie p-1">
      {abas.map((a) => (
        <Link
          key={a.valor}
          href={a.href}
          aria-current={atual === a.valor ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${FOCO} ${
            atual === a.valor ? "bg-acao font-semibold text-sobre-acao" : "text-texto-2 hover:text-texto"
          }`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
