import { LogOut } from "lucide-react";
import Link from "next/link";
import { LogoRaion } from "@/components/marca";
import { obterSessao } from "@/lib/sessao";
import { trocarEmpresa } from "@/lib/acoes/empresa-atual";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { Menu } from "./menu";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  const papel = sessao.atual?.papel;

  const itens = [
    ...(sessao.atual
      ? [
          { href: "/inicio", rotulo: "Início" },
          { href: "/negocios", rotulo: "Negócios" },
          { href: "/tarefas", rotulo: "Tarefas" },
          { href: "/contatos", rotulo: "Contatos" },
        ]
      : []),
    ...(papel === "admin"
      ? [
          { href: "/configuracoes/funil", rotulo: "Funis e etapas", grupo: "Configurações" },
          { href: "/configuracoes/origens", rotulo: "Origens", grupo: "Configurações" },
          { href: "/configuracoes/listas", rotulo: "Etiquetas e motivos", grupo: "Configurações" },
          { href: "/configuracoes/calculadora", rotulo: "Kits e calculadora", grupo: "Configurações" },
          { href: "/configuracoes/usuarios", rotulo: "Usuários", grupo: "Configurações" },
          { href: "/configuracoes/equipes", rotulo: "Equipes", grupo: "Configurações" },
        ]
      : []),
    ...(sessao.superAdmin ? [{ href: "/super-admin", rotulo: "Super-admin", grupo: "Plataforma" }] : []),
  ];

  const iniciais = sessao.nome
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-5 bg-carvao p-4 text-offwhite md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:p-5">
        <div className="flex items-center justify-between gap-3 md:block">
          <Link href="/inicio" aria-label="Início">
            <LogoRaion tom="claro" altura={28} />
          </Link>
          {sessao.vinculos.length > 1 ? (
            <form action={trocarEmpresa} className="flex gap-1 md:mt-5">
              <select
                name="empresaId"
                defaultValue={sessao.atual?.empresaId}
                aria-label="Empresa"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-offwhite"
              >
                {sessao.vinculos.map((v) => (
                  <option key={v.empresaId} value={v.empresaId} className="text-carvao">
                    {v.empresaNome}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-white/10 px-2 text-sm hover:border-dourado">Ir</button>
            </form>
          ) : (
            sessao.atual && (
              <p className="hidden truncate text-xs tracking-[0.2em] text-offwhite/50 uppercase md:mt-5 md:block">{sessao.atual.empresaNome}</p>
            )
          )}
        </div>
        <Menu itens={itens} />
        <div className="hidden items-center gap-3 border-t border-white/10 pt-4 md:mt-auto md:flex">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dourado/15 text-xs font-semibold text-dourado">
            {iniciais}
          </span>
          <Link href="/perfil" className="min-w-0 flex-1" title="Meu perfil">
            <span className="block truncate text-sm font-medium text-offwhite hover:underline">{sessao.nome}</span>
            {papel && <span className="block text-xs text-offwhite/50">{ROTULO_PAPEL[papel]}</span>}
          </Link>
          <form action="/sair" method="post">
            <button aria-label="Sair" title="Sair" className="rounded-md p-1.5 text-offwhite/50 hover:bg-white/5 hover:text-offwhite">
              <LogOut size={16} />
            </button>
          </form>
        </div>
        <div className="flex items-center justify-between text-sm md:hidden">
          <Link href="/perfil" className="truncate text-offwhite/70">
            {sessao.nome}
          </Link>
          <form action="/sair" method="post">
            <button className="text-offwhite/70">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-10">{children}</main>
    </div>
  );
}
