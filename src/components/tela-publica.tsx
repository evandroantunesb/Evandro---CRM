import Image from "next/image";
import type { ReactNode } from "react";
import { LogoRaion } from "@/components/marca";

/** Login, convite e senha: painel da marca à esquerda (no computador) e o formulário à direita. */
export function TelaPublica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen">
      <section className="relative hidden w-1/2 overflow-hidden bg-carvao lg:block">
        <Image src="/marca/paisagem.jpg" alt="" fill priority sizes="50vw" className="object-cover opacity-80" />
        <div className="absolute inset-0 bg-linear-to-t from-carvao via-carvao/40 to-carvao/20" />
        <div className="relative flex h-full flex-col justify-between p-12 text-offwhite">
          <LogoRaion tom="claro" altura={30} />
          <div className="max-w-md">
            <p className="font-titulo text-4xl leading-tight font-light">
              Relacionamentos de hoje.
              <br />
              Resultados de amanhã.
            </p>
            <span className="my-6 block h-px w-14 bg-dourado" />
            <p className="text-sm leading-relaxed text-offwhite/80">
              Um CRM criado para negócios que constroem o agora e um futuro mais brilhante.
            </p>
          </div>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <LogoRaion altura={28} />
          </div>
          <p className="mb-2 text-[11px] font-medium tracking-[0.3em] text-zinc-500 uppercase">CRM para negócios que vão mais longe</p>
          <h1 className="mb-8 text-3xl font-semibold text-carvao">{titulo}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
