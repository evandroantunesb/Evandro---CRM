import Link from "next/link";
import { exigirPapel } from "@/lib/sessao";

const SECOES = [
  { href: "/gamificacao/administracao/regras", titulo: "Regras de pontos", descricao: "Eventos do CRM que geram XP e moedas." },
  { href: "/gamificacao/administracao/niveis-e-conquistas", titulo: "Níveis e conquistas", descricao: "Progressão por XP e marcos desbloqueáveis." },
  { href: "/configuracoes/metas", titulo: "Configuração de metas", descricao: "Metas de período por membro ou equipe." },
  { href: "/configuracoes/comissoes", titulo: "Planos de comissão", descricao: "Regras de comissionamento sobre negócios ganhos." },
  { href: "/gamificacao/administracao/recompensas", titulo: "Recompensas", descricao: "Catálogo de prêmios da loja." },
  { href: "/configuracoes/resgates", titulo: "Resgates", descricao: "Acompanhamento dos resgates solicitados pela equipe." },
  { href: "/configuracoes/usuarios#perfil-gamificacao", titulo: "Perfis de gamificação", descricao: "Perfil (SDR/Closer/CS Farmer) de cada pessoa, em Usuários." },
];

export default async function AdministracaoGamificacao() {
  await exigirPapel("admin");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Administração</h1>
      <p className="text-sm text-zinc-600">Configurações administrativas da Gamificação.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECOES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-colors outline-none hover:border-[var(--gf-verde)] focus-visible:border-[var(--gf-verde)]"
          >
            <p className="text-sm font-semibold text-zinc-900">{s.titulo}</p>
            <p className="mt-1 text-xs text-zinc-600">{s.descricao}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
