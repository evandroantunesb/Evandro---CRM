import Link from "next/link";
import type { ReactNode } from "react";
import { LogoRaion } from "@/components/marca";
import { PASSOS, type ChavePasso } from "@/lib/assistente";

/**
 * Moldura dos quadros aprovados do assistente (Onboarding, subprojeto 3): coluna escura com o plano, a frase e os
 * passos (feito ✓, pulado –, atual em destaque), trilha de progresso e "Pular por agora" no topo, e o rodapé com o
 * passo anterior. O conteúdo do passo traz o próprio "Continuar".
 */
export function MolduraAssistente({
  solo,
  nomeEmpresa,
  passos,
  atual,
  estados,
  anteriorHref,
  pular,
  children,
}: {
  solo: boolean;
  nomeEmpresa: string;
  passos: ChavePasso[];
  atual: ChavePasso;
  estados: Record<ChavePasso, "feito" | "pulado" | "pendente">;
  anteriorHref: string | null;
  /** Ação do "Pular por agora" (nula no último passo). */
  pular: (() => Promise<void>) | null;
  children: ReactNode;
}) {
  const numero = passos.indexOf(atual) + 1;
  return (
    <div className="flex min-h-screen bg-[#faf8f3] text-[#0f0f10] max-md:flex-col">
      <aside className="flex w-full shrink-0 flex-col gap-6 bg-[#0f0f10] px-6 py-8 text-[#faf8f3] md:w-[300px]">
        <LogoRaion tom="claro" altura={26} />
        <div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.16em] uppercase ${solo ? "bg-[#faf8f3]/12 text-[#faf8f3]" : "bg-[#d4af37] text-[#0f0f10]"}`}
          >
            Plano {solo ? "Solo" : "PRO"}
          </span>
          <p className="mt-3 font-titulo text-xl leading-snug font-light">
            Vamos deixar o Raion com a cara da <b className="font-semibold">{nomeEmpresa}</b>.
          </p>
        </div>
        <ol className="flex flex-col gap-0.5 max-md:hidden">
          {passos.map((p, i) => {
            const esteAtual = p === atual;
            const estado = estados[p];
            return (
              <li
                key={p}
                aria-current={esteAtual ? "step" : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] ${
                  esteAtual ? "bg-[#faf8f3]/8 font-semibold text-[#faf8f3]" : estado === "feito" ? "text-[#faf8f3]/85" : "text-[#faf8f3]/55"
                }`}
              >
                <b
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] ${
                    esteAtual ? "bg-[#faf8f3] text-[#0f0f10]" : estado === "feito" ? "bg-[#d4af37] text-[#0f0f10]" : "bg-[#faf8f3]/8"
                  }`}
                >
                  {esteAtual ? i + 1 : estado === "feito" ? "✓" : estado === "pulado" ? "–" : i + 1}
                </b>
                {PASSOS[p].titulo}
              </li>
            );
          })}
        </ol>
        <p className="mt-auto text-xs leading-relaxed text-[#faf8f3]/55 max-md:hidden">
          Tudo aqui pode ser mudado depois em Configurações. Dá para parar e continuar de onde parou.
        </p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-5 py-8 md:px-10 md:py-9">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#5f6672]">
            Passo {numero} de {passos.length}
          </span>
          <div className="h-1.5 max-w-80 flex-1 overflow-hidden rounded-full bg-[#e5e2da]" aria-hidden>
            <span className="block h-full rounded-full bg-[#d4af37]" style={{ width: `${Math.round((numero / passos.length) * 100)}%` }} />
          </div>
          {pular ? (
            <form action={pular}>
              <button type="submit" className="text-xs text-[#5f6672] hover:underline">
                Pular por agora
              </button>
            </form>
          ) : (
            <span />
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#5f6672] uppercase">{PASSOS[atual].titulo}</p>
          <h1 className="mt-1.5 font-titulo text-[34px] font-light tracking-tight">{PASSOS[atual].chamada}</h1>
        </div>
        {children}
        {anteriorHref && (
          <div className="mt-auto border-t border-[#e5e2da] pt-4">
            <Link href={anteriorHref} className="inline-flex min-h-11 items-center rounded-full border border-[#e5e2da] bg-white px-5 text-sm">
              ← {PASSOS[passos[numero - 2]].titulo}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
