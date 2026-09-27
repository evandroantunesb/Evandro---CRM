import Image from "next/image";
import type { ReactNode } from "react";
import { LogoRaion } from "@/components/marca";

/** Login, convite e senha: painel da marca à esquerda (no computador) e o formulário à direita. */
export function TelaPublica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative h-40 w-full shrink-0 overflow-hidden bg-carvao sm:h-52 lg:h-auto lg:w-1/2">
        <Image
          src="/marca/paisagem.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[65%_center] opacity-80"
        />
        <div className="absolute inset-0 bg-linear-to-t from-carvao via-carvao/40 to-carvao/20" />
        <div className="relative flex h-full flex-col justify-between p-6 text-offwhite lg:justify-between lg:p-12">
          <LogoRaion tom="claro" altura={28} />
          <div className="hidden max-w-md lg:block">
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
          <p className="mb-2 text-[11px] font-medium tracking-[0.3em] text-zinc-500 uppercase">CRM para negócios que vão mais longe</p>
          <h1 className="mb-8 text-3xl font-semibold text-carvao">{titulo}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
