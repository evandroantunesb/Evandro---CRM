import Link from "next/link";

/**
 * Alternância entre os modos de Obras. Gestão é o modo operacional (lista e detalhe atuais).
 * Apresentação ainda não existe: fica visível, desabilitada e marcada como "Em desenvolvimento",
 * sem link — nada de tela incompleta fingindo funcionar.
 */
export function ModosObras({ hrefGestao }: { hrefGestao: string }) {
  return (
    <div role="group" aria-label="Modo de visualização" className="inline-flex w-fit max-w-full flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      <Link href={hrefGestao} aria-current="page" className="rounded-md bg-carvao px-3 py-1.5 font-medium text-offwhite">
        Gestão
      </Link>
      <span
        aria-disabled="true"
        title="O modo Apresentação ainda está em desenvolvimento."
        className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-zinc-400"
      >
        Apresentação
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">Em desenvolvimento</span>
      </span>
    </div>
  );
}
