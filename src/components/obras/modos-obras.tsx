import Link from "next/link";

/**
 * Alternância entre os modos de Obras: Gestão (operacional: lista e detalhe com ações) e
 * Apresentação (executivo, somente leitura, navegação como slides). Os dois levam os mesmos
 * filtros na URL.
 */
export function ModosObras({ modo, hrefGestao, hrefApresentacao }: { modo: "gestao" | "apresentacao"; hrefGestao: string; hrefApresentacao: string }) {
  const item = (ativo: boolean) => `rounded-md px-3 py-1.5 ${ativo ? "bg-carvao font-medium text-offwhite" : "text-zinc-600 hover:text-carvao"}`;
  return (
    <nav aria-label="Modo de visualização" className="inline-flex w-fit max-w-full flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      <Link href={hrefGestao} aria-current={modo === "gestao" ? "page" : undefined} className={item(modo === "gestao")}>
        Gestão
      </Link>
      <Link href={hrefApresentacao} aria-current={modo === "apresentacao" ? "page" : undefined} className={item(modo === "apresentacao")}>
        Apresentação
      </Link>
    </nav>
  );
}
