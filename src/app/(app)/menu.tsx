"use client";

import {
  Building2,
  Calculator,
  CheckSquare,
  Home,
  KanbanSquare,
  ListTree,
  Radio,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONES: Record<string, LucideIcon> = {
  "/inicio": Home,
  "/negocios": KanbanSquare,
  "/tarefas": CheckSquare,
  "/contatos": UsersRound,
  "/configuracoes/funil": ListTree,
  "/configuracoes/origens": Radio,
  "/configuracoes/listas": Tags,
  "/configuracoes/calculadora": Calculator,
  "/configuracoes/usuarios": UserCog,
  "/configuracoes/equipes": Users,
  "/super-admin": ShieldCheck,
};

type Item = { href: string; rotulo: string; grupo?: string };

export function Menu({ itens }: { itens: Item[] }) {
  const caminho = usePathname();
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {itens.map((item, i) => {
        const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
        const Icone = ICONES[item.href] ?? Building2;
        // Mostra o nome do grupo antes do primeiro item dele.
        const titulo = item.grupo && item.grupo !== itens[i - 1]?.grupo ? item.grupo : null;
        return (
          <div key={item.href} className="contents">
            {titulo && (
              <p className="mt-5 mb-1 hidden px-3 text-[10px] font-medium tracking-[0.25em] text-offwhite/40 uppercase md:block">
                {titulo}
              </p>
            )}
            <Link
              href={item.href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                ativo ? "bg-white/[0.06] font-medium text-offwhite" : "text-offwhite/60 hover:bg-white/[0.04] hover:text-offwhite"
              }`}
            >
              {ativo && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-dourado" />}
              <Icone size={17} strokeWidth={1.75} className={ativo ? "text-dourado" : ""} />
              {item.rotulo}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
