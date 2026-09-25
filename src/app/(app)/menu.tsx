"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; rotulo: string };

export function Menu({ itens }: { itens: Item[] }) {
  const caminho = usePathname();
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {itens.map((item) => {
        const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              ativo ? "bg-amber-100 font-medium text-amber-900" : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
