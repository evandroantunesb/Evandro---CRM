import {
  BadgeDollarSign,
  CalendarClock,
  Calculator,
  ChevronRight,
  FileSignature,
  FileText,
  Gift,
  ListChecks,
  ListTree,
  Medal,
  PackageCheck,
  QrCode,
  Radio,
  Tags,
  Target,
  Thermometer,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { exigirPapel } from "@/lib/sessao";

type Item = { href: string; titulo: string; descricao: string; Icone: LucideIcon };

/**
 * Hub das configurações do admin: um só item no menu, tudo agrupado aqui. As telas e URLs são as
 * mesmas de antes (inclusive as da administração da Gamificação, que algumas vivem em /configuracoes
 * e outras em /gamificacao/administracao). O `id` de cada grupo serve de âncora (#gamificacao).
 */
const GRUPOS: { id: string; titulo: string; itens: Item[] }[] = [
  {
    id: "aquisicao",
    titulo: "Aquisição",
    itens: [
      { href: "/configuracoes/captura", titulo: "Captura de leads", descricao: "Formulários, links e QR Codes para divulgar.", Icone: QrCode },
      { href: "/configuracoes/origens", titulo: "Origens", descricao: "Canais de entrada e distribuição dos leads.", Icone: Radio },
    ],
  },
  {
    id: "comercial",
    titulo: "Comercial",
    itens: [
      { href: "/configuracoes/funil", titulo: "Funis e etapas", descricao: "Etapas do Kanban e regras de cada funil.", Icone: ListTree },
      { href: "/configuracoes/listas", titulo: "Etiquetas e motivos", descricao: "Etiquetas dos negócios e motivos de perda.", Icone: Tags },
      { href: "/configuracoes/temperatura", titulo: "Temperatura dos negócios", descricao: "Regras que deixam um negócio Quente ou Frio (o gestor também edita).", Icone: Thermometer },
    ],
  },
  {
    id: "venda",
    titulo: "Venda",
    itens: [
      { href: "/configuracoes/calculadora", titulo: "Kits e calculadora", descricao: "Kits prontos do catálogo e parâmetros do cálculo.", Icone: Calculator },
      { href: "/configuracoes/propostas", titulo: "Propostas comerciais", descricao: "Modelos e identidade visual das propostas.", Icone: FileText },
      { href: "/configuracoes/validade-proposta", titulo: "Validade da proposta", descricao: "Prazo padrão da proposta (o gestor também edita).", Icone: CalendarClock },
      { href: "/configuracoes/contrato", titulo: "Modelo de contrato", descricao: "Texto do contrato, com campos preenchidos sozinhos.", Icone: FileSignature },
    ],
  },
  {
    id: "obras",
    titulo: "Obras",
    itens: [
      { href: "/configuracoes/fixacoes", titulo: "Tipos de fixação", descricao: "Opções de fixação do telhado escolhidas na obra.", Icone: Wrench },
      { href: "/configuracoes/engenharia", titulo: "Checklist da Engenharia", descricao: "Documentos que a Engenharia confere em cada obra.", Icone: ListChecks },
    ],
  },
  {
    id: "pessoas",
    titulo: "Pessoas",
    itens: [
      { href: "/configuracoes/usuarios", titulo: "Usuários", descricao: "Convites, papéis e acesso de cada pessoa.", Icone: UserCog },
      { href: "/configuracoes/equipes", titulo: "Equipes", descricao: "Equipes e seus gestores.", Icone: Users },
    ],
  },
  {
    id: "gamificacao",
    titulo: "Gamificação e metas",
    itens: [
      { href: "/gamificacao/administracao/regras", titulo: "Regras de pontos", descricao: "Eventos do CRM que geram XP e moedas.", Icone: ListChecks },
      { href: "/gamificacao/administracao/niveis-e-conquistas", titulo: "Níveis e conquistas", descricao: "Progressão por XP e marcos desbloqueáveis.", Icone: Medal },
      { href: "/configuracoes/usuarios#perfil-gamificacao", titulo: "Perfis de gamificação", descricao: "Perfil (SDR/Closer/CS Farmer) de cada pessoa, em Usuários.", Icone: UserCog },
      { href: "/configuracoes/metas", titulo: "Metas", descricao: "Metas de período por membro ou equipe.", Icone: Target },
      { href: "/configuracoes/comissoes", titulo: "Planos de comissão", descricao: "Regras de comissionamento sobre negócios ganhos.", Icone: BadgeDollarSign },
      { href: "/gamificacao/administracao/recompensas", titulo: "Recompensas", descricao: "Catálogo de prêmios da loja.", Icone: Gift },
      { href: "/configuracoes/resgates", titulo: "Resgates", descricao: "Pedidos de resgate feitos pela equipe.", Icone: PackageCheck },
    ],
  },
];

export default async function Configuracoes() {
  await exigirPapel("admin");

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Configurações</h1>
        <p className="text-sm text-texto-2">Como a sua empresa funciona no Raion: aquisição, venda, pessoas e gamificação.</p>
      </header>
      {GRUPOS.map((grupo) => (
        <section key={grupo.id} id={grupo.id} aria-labelledby={`grupo-${grupo.id}`} className="flex scroll-mt-20 flex-col gap-3">
          <h2 id={`grupo-${grupo.id}`} className="sobretitulo px-1">
            {grupo.titulo}
          </h2>
          <ul className="painel divide-y divide-linha overflow-hidden">
            {grupo.itens.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex min-h-16 items-center gap-4 px-4 py-3 transition-colors duration-200 ease-raion hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none md:px-5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-superficie-2 text-dourado-texto transition-colors group-hover:bg-superficie">
                    <item.Icone size={19} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-texto">{item.titulo}</span>
                    <span className="block text-sm text-texto-2">{item.descricao}</span>
                  </span>
                  <ChevronRight
                    size={18}
                    aria-hidden
                    className="shrink-0 text-texto-2 transition-transform duration-200 ease-raion group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
