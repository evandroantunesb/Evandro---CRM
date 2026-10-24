"use client";

import {
  BarChart3,
  Building2,
  CheckSquare,
  ChevronRight,
  FileSignature,
  Gift,
  HardHat,
  Home,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Menu as IconeMenu,
  Settings,
  ShieldCheck,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Janela } from "@/components/janela";

const ICONES: Record<string, LucideIcon> = {
  "/inicio": Home,
  "/negocios": KanbanSquare,
  "/tarefas": CheckSquare,
  "/contatos": UsersRound,
  "/leads-a-distribuir": Inbox,
  "/propostas-contratos": FileSignature,
  "/obras": HardHat,
  "/painel": BarChart3,
  "/gamificacao": LayoutDashboard,
  "/gamificacao/ranking": Trophy,
  "/gamificacao/loja": Gift,
  "/configuracoes": Settings,
  "/super-admin": ShieldCheck,
};

/**
 * `href` é o destino do link e também a rota que o torna ativo. `ativoEm` lista rotas
 * (prefixos) adicionais que também marcam o item como ativo — ex.: "Desempenho" leva a
 * /gamificacao/ranking e fica ativo em /gamificacao/metas. `exato` faz o próprio `href` só
 * casar com a rota exata (não com subrotas) — usado por "Visão geral", que não deve ficar
 * ativa dentro das demais telas de /gamificacao. `secao` dá o título do bloco.
 */
export type ItemMenu = {
  href: string;
  rotulo: string;
  secao?: string;
  novo?: boolean;
  ativoEm?: string[];
  exato?: boolean;
};

const rotaCorresponde = (caminho: string, rota: string) => caminho === rota || caminho.startsWith(`${rota}/`);

/**
 * Item ativo na rota atual. O prefixo mais específico (rota mais longa) vence: evita que uma rota
 * "pai" (ex.: /gamificacao) fique ativa junto com uma "filha" que pertence a outro item via `ativoEm`.
 */
function useHrefAtivo(itens: ItemMenu[]) {
  const caminho = usePathname();
  let hrefAtivo: string | undefined;
  let tamanhoMelhorRota = -1;
  for (const item of itens) {
    const rotas = [
      { rota: item.href, exata: item.exato ?? false },
      ...(item.ativoEm ?? []).map((rota) => ({ rota, exata: false })),
    ];
    for (const { rota, exata } of rotas) {
      const casa = exata ? caminho === rota : rotaCorresponde(caminho, rota);
      if (casa && rota.length > tamanhoMelhorRota) {
        tamanhoMelhorRota = rota.length;
        hrefAtivo = item.href;
      }
    }
  }
  return { caminho, hrefAtivo };
}

/** Itens em blocos pela `secao`, na ordem em que aparecem (itens sem seção formam um bloco sem título). */
function emSecoes(itens: ItemMenu[]) {
  return itens.reduce<{ titulo?: string; itens: ItemMenu[] }[]>((acc, item) => {
    const ultimo = acc.at(-1);
    if (ultimo && ultimo.titulo === item.secao) ultimo.itens.push(item);
    else acc.push({ titulo: item.secao, itens: [item] });
    return acc;
  }, []);
}

/** Menu da barra lateral (computador). */
export function MenuLateral({ itens }: { itens: ItemMenu[] }) {
  const { hrefAtivo } = useHrefAtivo(itens);
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1">
      {emSecoes(itens).map((secao, i) => (
        <div key={secao.titulo ?? `sem-titulo-${i}`} className="flex flex-col gap-1">
          {secao.titulo && (
            <p className="mt-5 mb-1 px-3 text-[10px] font-medium tracking-[0.25em] text-offwhite/40 uppercase">{secao.titulo}</p>
          )}
          {secao.itens.map((item) => {
            const ativo = item.href === hrefAtivo;
            const Icone = ICONES[item.href] ?? Building2;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
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
          })}
        </div>
      ))}
    </nav>
  );
}

/** Fluxos de tela cheia com barra de ações própria no rodapé: a barra de abas sai da frente. */
const ROTAS_SEM_ABAS = ["/negocios/novo"];

/**
 * Navegação do celular, no padrão de app: barra fixa embaixo com as abas do papel (`abas`, hrefs
 * de `itens`) e "Mais", que abre de baixo o restante do menu e o que vier em `extras` (perfil,
 * empresa, tema, sair).
 */
export function NavegacaoCelular({ itens, abas, extras }: { itens: ItemMenu[]; abas: string[]; extras: ReactNode }) {
  const { caminho, hrefAtivo } = useHrefAtivo(itens);
  const [maisAberto, setMaisAberto] = useState(false);
  const itensAbas = abas.map((href) => itens.find((i) => i.href === href)).filter((i): i is ItemMenu => !!i);
  const restantes = itens.filter((i) => !abas.includes(i.href));
  const ativoNoMais = restantes.some((i) => i.href === hrefAtivo);
  const fechar = () => setMaisAberto(false);

  if (ROTAS_SEM_ABAS.some((rota) => rotaCorresponde(caminho, rota))) return null;

  const aba = (ativo: boolean) =>
    `flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 ease-raion ${
      ativo ? "text-offwhite" : "text-offwhite/55"
    }`;

  return (
    <>
      <nav
        aria-label="Menu principal"
        className="barra-lateral fixed inset-x-0 bottom-0 z-30 grid border-t border-white/[0.06] bg-carvao/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${itensAbas.length + 1}, minmax(0, 1fr))` }}
      >
        {itensAbas.map((item) => {
          const ativo = item.href === hrefAtivo;
          const Icone = ICONES[item.href] ?? Building2;
          return (
            <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined} className={aba(ativo)}>
              <Icone size={22} strokeWidth={ativo ? 2 : 1.75} className={ativo ? "text-dourado" : ""} />
              {item.rotulo}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMaisAberto(true)} aria-haspopup="dialog" className={aba(ativoNoMais || maisAberto)}>
          <IconeMenu size={22} strokeWidth={ativoNoMais ? 2 : 1.75} className={ativoNoMais ? "text-dourado" : ""} />
          Mais
        </button>
      </nav>

      <Janela aberta={maisAberto} aoFechar={fechar} titulo="Menu">
        {emSecoes(restantes).map((secao, i) => (
          <section key={secao.titulo ?? `sem-titulo-${i}`} className="flex flex-col gap-2">
            {secao.titulo && <h3 className="sobretitulo px-1">{secao.titulo}</h3>}
            <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-superficie-2">
              {secao.itens.map((item) => {
                const ativo = item.href === hrefAtivo;
                const Icone = ICONES[item.href] ?? Building2;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={fechar}
                      aria-current={ativo ? "page" : undefined}
                      className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-[15px] text-texto transition-colors active:bg-linha"
                    >
                      <Icone size={19} strokeWidth={1.75} className={ativo ? "text-dourado-texto" : "text-texto-2"} />
                      <span className={`flex-1 ${ativo ? "font-semibold" : ""}`}>{item.rotulo}</span>
                      {item.novo && <span className="h-2 w-2 rounded-full bg-dourado" title="Novidade" />}
                      <ChevronRight size={17} className="text-texto-2" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {extras}
      </Janela>
    </>
  );
}
