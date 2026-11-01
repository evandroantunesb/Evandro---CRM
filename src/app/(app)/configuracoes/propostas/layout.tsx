import Link from "next/link";
import { Voltar } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";

export default async function LayoutPropostas({ children }: { children: React.ReactNode }) {
  await exigirPapel("admin");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Voltar href="/configuracoes">Configurações</Voltar>
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Propostas comerciais</h1>
        <p className="text-sm text-texto-2">Monte os modelos de proposta que os vendedores usam e a identidade visual usada neles.</p>
      </div>
      <nav className="flex gap-1 border-b border-linha">
        <Link href="/configuracoes/propostas" className="rounded-t-lg px-3 py-2 text-sm font-medium text-texto-2 hover:text-texto">
          Modelos de proposta
        </Link>
        <Link href="/configuracoes/propostas/identidade" className="rounded-t-lg px-3 py-2 text-sm font-medium text-texto-2 hover:text-texto">
          Identidade visual
        </Link>
      </nav>
      {children}
    </div>
  );
}
