"use client";

import {
  Building2,
  Calculator,
  CheckSquare,
  ChevronDown,
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
import { useState } from "react";

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

function ItemMenu({ item, ativo }: { item: Item; ativo: boolean }) {
  const Icone = ICONES[item.href] ?? Building2;
  return (
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
  );
}

export function Menu({ itens }: { itens: Item[] }) {
  const caminho = usePathname();
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const ehAtivo = (href: string) => caminho === href || caminho.startsWith(`${href}/`);

  // No celular, agrupa os itens que têm "grupo" atrás de um botão expansível,
  // em vez de espalhar tudo numa única faixa horizontal.
  const principais = itens.filter((i) => !i.grupo);
  const grupos = itens.reduce<{ nome: string; itens: Item[] }[]>((acc, item) => {
    if (!item.grupo) return acc;
    const existente = acc.find((g) => g.nome === item.grupo);
    if (existente) existente.itens.push(item);
    else acc.push({ nome: item.grupo, itens: [item] });
    return acc;
  }, []);

  return (
    <nav className="flex flex-col gap-1">
      <div className="flex flex-row gap-1 overflow-x-auto md:hidden">
        {principais.map((item) => (
          <ItemMenu key={item.href} item={item} ativo={ehAtivo(item.href)} />
        ))}
        {grupos.map((grupo) => {
          const ativoNoGrupo = grupo.itens.some((i) => ehAtivo(i.href));
          const aberto = grupoAberto === grupo.nome;
          return (
            <button
              key={grupo.nome}
              type="button"
              onClick={() => setGrupoAberto(aberto ? null : grupo.nome)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                ativoNoGrupo || aberto ? "bg-white/[0.06] font-medium text-offwhite" : "text-offwhite/60 hover:bg-white/[0.04] hover:text-offwhite"
              }`}
            >
              {grupo.nome}
              <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
            </button>
          );
        })}
      </div>
      {grupos.map(
        (grupo) =>
          grupoAberto === grupo.nome && (
            <div key={grupo.nome} className="flex flex-col gap-1 rounded-lg bg-white/[0.03] p-1 md:hidden">
              {grupo.itens.map((item) => (
                <ItemMenu key={item.href} item={item} ativo={ehAtivo(item.href)} />
              ))}
            </div>
          ),
      )}

      <div className="hidden md:flex md:flex-col md:gap-1">
        {itens.map((item, i) => {
          const titulo = item.grupo && item.grupo !== itens[i - 1]?.grupo ? item.grupo : null;
          return (
            <div key={item.href} className="contents">
              {titulo && (
                <p className="mt-5 mb-1 px-3 text-[10px] font-medium tracking-[0.25em] text-offwhite/40 uppercase">{titulo}</p>
              )}
              <ItemMenu item={item} ativo={ehAtivo(item.href)} />
            </div>
          );
        })}
      </div>
    </nav>
  );
}
