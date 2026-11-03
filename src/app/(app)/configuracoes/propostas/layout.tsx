import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { exigirPapel } from "@/lib/sessao";

export default async function LayoutPropostas({ children }: { children: React.ReactNode }) {
  await exigirPapel("admin");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Venda"
        titulo="Propostas comerciais"
        descricao="Monte os modelos de proposta que os vendedores usam e a identidade visual usada neles."
      />
      <nav className="flex gap-1 border-b border-zinc-200">
        <Link href="/configuracoes/propostas" className="rounded-t-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-carvao">
          Modelos de proposta
        </Link>
        <Link href="/configuracoes/propostas/identidade" className="rounded-t-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-carvao">
          Identidade visual
        </Link>
      </nav>
      {children}
    </div>
  );
}
