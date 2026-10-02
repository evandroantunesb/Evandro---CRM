"use client";

import {
  Award,
  Building2,
  Calculator,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  Gift,
  Home,
  KanbanSquare,
  LayoutDashboard,
  ListTree,
  Radio,
  Rocket,
  ShieldCheck,
  Star,
  Tags,
  Target,
  Trophy,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ICONES: Record<string, LucideIcon> = {
  "/inicio": Home,
  "/negocios": KanbanSquare,
  "/tarefas": CheckSquare,
  "/contatos": UsersRound,
  "/configuracoes/funil": ListTree,
  "/configuracoes/origens": Radio,
  "/configuracoes/listas": Tags,
  "/configuracoes/calculadora": Calculator,
  "/configuracoes/gamificacao": Award,
  "/configuracoes/metas": Target,
  "/configuracoes/comissoes": CircleDollarSign,
  "/configuracoes/resgates": Gift,
  "/configuracoes/usuarios": UserCog,
  "/configuracoes/equipes": Users,
  "/gamificacao": LayoutDashboard,
  "/gamificacao/jornada": Rocket,
  "/gamificacao/ranking": Trophy,
  "/gamificacao/loja": Gift,
  "/gamificacao/extrato": Star,
  "/gamificacao/metas": Target,
  "/gamificacao/comissoes": CircleDollarSign,
  "/super-admin": ShieldCheck,
};

type Item = { href: string; rotulo: string; grupo?: string; novo?: boolean };

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
      {item.novo && <span className="h-1.5 w-1.5 rounded-full bg-dourado" title="Novidade" />}
    </Link>
  );
}

export function Menu({ itens }: { itens: Item[] }) {
  const caminho = usePathname();
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [transbordaNaFaixa, setTransbordaNaFaixa] = useState(false);
  const faixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const faixa = faixaRef.current;
    if (!faixa) return;
    const verificar = () => setTransbordaNaFaixa(faixa.scrollWidth > faixa.clientWidth + 1);
    verificar();
    const observador = new ResizeObserver(verificar);
    observador.observe(faixa);
    return () => observador.disconnect();
  }, [itens, grupoAberto]);
  // Prefixo mais específico vence: evita que uma rota "pai" (ex.: /gamificacao)
  // fique marcada como ativa junto com uma rota "filha" mais específica.
  const correspondentes = itens.filter((i) => caminho === i.href || caminho.startsWith(`${i.href}/`));
  const hrefAtivo = correspondentes.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const ehAtivo = (href: string) => href === hrefAtivo;

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
      <div
        ref={faixaRef}
        className="flex flex-row gap-1 overflow-x-auto md:hidden"
        style={transbordaNaFaixa ? { maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)" } : undefined}
      >
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
            <div key={grupo.nome} className="max-h-[50vh] overflow-y-auto rounded-lg bg-white/[0.03] p-1 md:hidden">
              <div className="flex flex-col gap-1">
                {grupo.itens.map((item) => (
                  <ItemMenu key={item.href} item={item} ativo={ehAtivo(item.href)} />
                ))}
              </div>
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
