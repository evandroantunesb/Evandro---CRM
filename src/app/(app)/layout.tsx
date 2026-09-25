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
          { href: "/configuracoes/funil", rotulo: "Funis e etapas" },
          { href: "/configuracoes/origens", rotulo: "Origens" },
          { href: "/configuracoes/listas", rotulo: "Etiquetas e motivos" },
          { href: "/configuracoes/usuarios", rotulo: "Usuários" },
          { href: "/configuracoes/equipes", rotulo: "Equipes" },
        ]
      : []),
    ...(sessao.superAdmin ? [{ href: "/super-admin", rotulo: "Super-admin" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-4 md:w-60 md:border-b-0 md:border-r">
        <div>
          <p className="text-sm font-semibold tracking-wide text-amber-600">RAION CRM</p>
          {sessao.vinculos.length > 1 ? (
            <form action={trocarEmpresa} className="mt-2 flex gap-1">
              <select
                name="empresaId"
                defaultValue={sessao.atual?.empresaId}
                aria-label="Empresa"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              >
                {sessao.vinculos.map((v) => (
                  <option key={v.empresaId} value={v.empresaId}>
                    {v.empresaNome}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-zinc-300 px-2 text-sm">Ir</button>
            </form>
          ) : (
            sessao.atual && <p className="mt-1 text-sm text-zinc-800">{sessao.atual.empresaNome}</p>
          )}
        </div>
        <Menu itens={itens} />
        <div className="flex items-center justify-between gap-2 text-sm md:mt-auto md:block md:border-t md:border-zinc-200 md:pt-3">
          <p className="truncate font-medium text-zinc-900">{sessao.nome}</p>
          {papel && <p className="text-zinc-500">{ROTULO_PAPEL[papel]}</p>}
          <form action="/sair" method="post" className="md:mt-2">
            <button className="text-zinc-600 hover:underline">Sair</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
