import Link from "next/link";
import {
  BadgeDollarSign,
  ChevronRight,
  Gift,
  Gauge,
  ListChecks,
  Medal,
  PackageCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCog,
} from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { CabecalhoPaginaGf, PaginaGf, SecaoGf, type IconeGf, type TomIconeGf } from "../_compartilhado/ui";

type ItemAdmin = { href: string; titulo: string; descricao: string; Icone: IconeGf; tom: TomIconeGf };

// Mesmas sete telas e URLs de antes; só agrupadas por assunto na página (o menu não muda).
const GRUPOS: { titulo: string; descricao: string; Icone: IconeGf; tom: TomIconeGf; itens: ItemAdmin[] }[] = [
  {
    titulo: "Gamificação",
    descricao: "Como as pessoas ganham XP e moedas e evoluem no programa.",
    Icone: Sparkles,
    tom: "verde",
    itens: [
      { href: "/gamificacao/administracao/regras", titulo: "Regras de pontos", descricao: "Eventos do CRM que geram XP e moedas.", Icone: ListChecks, tom: "verde" },
      { href: "/gamificacao/administracao/niveis-e-conquistas", titulo: "Níveis e conquistas", descricao: "Progressão por XP e marcos desbloqueáveis.", Icone: Medal, tom: "dourado" },
      { href: "/configuracoes/usuarios#perfil-gamificacao", titulo: "Perfis de gamificação", descricao: "Perfil (SDR/Closer/CS Farmer) de cada pessoa, em Usuários.", Icone: UserCog, tom: "neutro" },
    ],
  },
  {
    titulo: "Performance",
    descricao: "Metas e comissões do time comercial.",
    Icone: TrendingUp,
    tom: "verde",
    itens: [
      { href: "/configuracoes/metas", titulo: "Configuração de metas", descricao: "Metas de período por membro ou equipe.", Icone: Target, tom: "verde" },
      { href: "/configuracoes/comissoes", titulo: "Planos de comissão", descricao: "Regras de comissionamento sobre negócios ganhos.", Icone: BadgeDollarSign, tom: "verde" },
    ],
  },
  {
    titulo: "Recompensas",
    descricao: "O que a equipe pode trocar por moedas e o acompanhamento dos pedidos.",
    Icone: Gauge,
    tom: "dourado",
    itens: [
      { href: "/gamificacao/administracao/recompensas", titulo: "Recompensas", descricao: "Catálogo de prêmios da loja.", Icone: Gift, tom: "dourado" },
      { href: "/configuracoes/resgates", titulo: "Resgates", descricao: "Acompanhamento dos resgates solicitados pela equipe.", Icone: PackageCheck, tom: "dourado" },
    ],
  },
];

const TOM_TILE: Record<TomIconeGf, string> = {
  verde: "bg-[var(--gf-verde-10)] text-[var(--gf-verde)]",
  dourado: "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]",
  neutro: "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]",
  vermelho: "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]",
};

export default async function AdministracaoGamificacao() {
  await exigirPapel("admin");

  return (
    <PaginaGf largura="media" className="gap-8">
      <CabecalhoPaginaGf titulo="Administração" descricao="Configurações administrativas da Gamificação." />
      {GRUPOS.map((grupo) => (
        <SecaoGf key={grupo.titulo} titulo={grupo.titulo} descricao={grupo.descricao} Icone={grupo.Icone} tom={grupo.tom}>
          <ul className="grid gap-3 @min-[620px]:grid-cols-2">
            {grupo.itens.map((s) => (
              <li key={s.href} className="min-w-0">
                <Link
                  href={s.href}
                  className="group flex h-full min-w-0 items-center gap-4 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:border-[var(--gf-verde-borda)] hover:bg-[var(--gf-surface-alta)] sm:p-5"
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TOM_TILE[s.tom]}`}>
                    <s.Icone size={24} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="gf-t-item block text-base">{s.titulo}</span>
                    <span className="gf-t-aux mt-0.5 block">{s.descricao}</span>
                  </span>
                  <ChevronRight
                    size={20}
                    aria-hidden
                    className="shrink-0 text-[var(--gf-texto-ter)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--gf-verde)]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </SecaoGf>
      ))}
    </PaginaGf>
  );
}
