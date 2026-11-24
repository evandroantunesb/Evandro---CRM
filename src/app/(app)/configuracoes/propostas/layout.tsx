import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { exigirPapel } from "@/lib/sessao";

/** Modelos: admin e gestor (pedido do Evandro, 24/11/2026). Identidade visual e o hub de Configurações: só o admin. */
export default async function LayoutPropostas({ children }: { children: React.ReactNode }) {
  const { atual } = await exigirPapel("admin", "gestor");
  const admin = atual.papel === "admin";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={admin ? { href: "/configuracoes", rotulo: "Configurações" } : undefined}
        sobretitulo={admin ? "Configurações · Venda" : "Gestão"}
        titulo="Propostas comerciais"
        descricao={
          admin
            ? "Monte os modelos de proposta que os vendedores usam e a identidade visual usada neles."
            : "Escolha o que aparece nas propostas da empresa: ligue, desligue e edite os blocos dos modelos."
        }
      />
      <nav className="flex gap-1 border-b border-zinc-200">
        <Link href="/configuracoes/propostas" className="rounded-t-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-carvao">
          Modelos de proposta
        </Link>
        {admin && (
          <Link href="/configuracoes/propostas/identidade" className="rounded-t-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-carvao">
            Identidade visual
          </Link>
        )}
      </nav>
      {children}
    </div>
  );
}
