"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Papel } from "@/lib/tipos";

type Aba = { href: string; rotulo: string };

/**
 * Navegação interna das seções agrupadas do menu lateral: Desempenho
 * (Ranking | Metas | Comissões) e Recompensas (Loja | Extrato / Meus resgates).
 * Comissões só aparece para quem participa (qualquer papel exceto admin/gestor);
 * a página em si não muda — só deixa de ter aba para admin/gestor.
 */
function abasDaSecao(secao: "desempenho" | "recompensas", papel: Papel): Aba[] {
  if (secao === "recompensas") {
    return [
      { href: "/gamificacao/loja", rotulo: "Loja" },
      { href: "/gamificacao/extrato", rotulo: "Extrato / Meus resgates" },
    ];
  }
  const abas: Aba[] = [
    { href: "/gamificacao/ranking", rotulo: "Ranking" },
    { href: "/gamificacao/metas", rotulo: "Metas" },
  ];
  if (papel !== "admin" && papel !== "gestor") abas.push({ href: "/gamificacao/comissoes", rotulo: "Comissões" });
  return abas;
}

export function AbasSecao({ secao, papel }: { secao: "desempenho" | "recompensas"; papel: Papel }) {
  const caminho = usePathname();
  const abas = abasDaSecao(secao, papel);

  return (
    <nav
      aria-label={secao === "desempenho" ? "Desempenho" : "Recompensas"}
      className="flex gap-1 overflow-x-auto border-b border-[var(--gf-borda)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {abas.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--gf-verde)]/50 ${
              ativa
                ? "border-[var(--gf-verde)] font-medium text-[var(--gf-verde)]"
                : "border-transparent text-[var(--gf-texto-sec)] hover:border-[var(--gf-borda)] hover:text-[var(--gf-texto)]"
            }`}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
