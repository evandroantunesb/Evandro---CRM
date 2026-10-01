"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = "/configuracoes/calculadora";

const ABAS = [
  { href: BASE, rotulo: "Calculadora" },
  { href: `${BASE}/kits`, rotulo: "Kits" },
  { href: `${BASE}/catalogo`, rotulo: "Catálogo" },
  { href: `${BASE}/parametros`, rotulo: "Parâmetros" },
];

/** Navegação interna de "Kits e calculadora" — rola na horizontal no celular em vez de quebrar linha. */
export function AbasCalculadora() {
  const caminho = usePathname();
  const ativa = (href: string) => (href === BASE ? caminho === BASE : caminho === href || caminho.startsWith(`${href}/`));

  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Seções de Kits e calculadora">
      <div className="flex min-w-max gap-1 border-b border-zinc-200">
        {ABAS.map((aba) => (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa(aba.href) ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              ativa(aba.href)
                ? "border-dourado text-carvao"
                : "border-transparent text-zinc-500 hover:text-carvao"
            }`}
          >
            {aba.rotulo}
          </Link>
        ))}
      </div>
    </nav>
  );
}
