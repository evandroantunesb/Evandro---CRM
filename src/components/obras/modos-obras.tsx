import Link from "next/link";

/**
 * Alternância entre os modos de Obras: Gestão (operacional: lista e detalhe com ações) — para admin e gestor, a visão
 * Completa —, Apresentação (executivo, somente leitura, navegação como slides) e, nas listas do PRO, Agenda (semana e
 * mês da operação). Gestão e Apresentação levam os mesmos filtros na URL. `escuro`: sobre a faixa escura da Completa.
 */
export function ModosObras({
  modo,
  hrefGestao,
  hrefApresentacao,
  hrefAgenda,
  rotuloGestao = "Gestão",
  escuro = false,
}: {
  modo: "gestao" | "apresentacao" | "agenda";
  hrefGestao: string;
  hrefApresentacao: string;
  hrefAgenda?: string;
  rotuloGestao?: string;
  escuro?: boolean;
}) {
  const item = (ativo: boolean) =>
    `rounded-md px-3 py-1.5 ${
      ativo
        ? escuro
          ? "bg-dourado font-medium text-carvao"
          : "bg-carvao font-medium text-offwhite"
        : escuro
          ? "text-offwhite/75 hover:text-offwhite"
          : "text-zinc-600 hover:text-carvao"
    }`;
  return (
    <nav
      aria-label="Modo de visualização"
      className={`inline-flex w-fit max-w-full flex-wrap rounded-lg border p-0.5 text-sm ${escuro ? "border-offwhite/20 bg-offwhite/5" : "border-zinc-200 bg-white"}`}
    >
      <Link href={hrefGestao} aria-current={modo === "gestao" ? "page" : undefined} className={item(modo === "gestao")}>
        {rotuloGestao}
      </Link>
      <Link href={hrefApresentacao} aria-current={modo === "apresentacao" ? "page" : undefined} className={item(modo === "apresentacao")}>
        Apresentação
      </Link>
      {hrefAgenda && (
        <Link href={hrefAgenda} aria-current={modo === "agenda" ? "page" : undefined} className={item(modo === "agenda")}>
          Agenda
        </Link>
      )}
    </nav>
  );
}
