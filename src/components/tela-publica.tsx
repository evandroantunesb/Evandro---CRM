import Image from "next/image";
import type { ReactNode } from "react";
import { LogoRaion } from "@/components/marca";
import { carregarTelaEntrada } from "@/lib/tela-entrada-servidor";

/**
 * Login, convite e senha: imagem da empresa à esquerda (no computador; no celular, uma faixa no topo, sem
 * a frase) e o formulário à direita, com a logo fixa acima dele (desenho "Acesso · Entrar"). A imagem, a
 * frase e o texto vêm de Configurações › Tela de entrada; sem `empresaId`, vale a empresa lembrada no
 * aparelho, e sem nenhuma, o padrão do Raion.
 */
export async function TelaPublica({ titulo, empresaId, children }: { titulo: string; empresaId?: string | null; children: ReactNode }) {
  const tela = await carregarTelaEntrada(empresaId);
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section aria-hidden className="relative h-40 w-full shrink-0 overflow-hidden bg-carvao sm:h-52 lg:h-auto lg:w-1/2">
        <Image
          src={tela.imagem}
          alt=""
          fill
          priority
          // A foto da empresa já chega reduzida (até 2400 px) do Storage público.
          unoptimized={tela.imagemPersonalizada}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[65%_center] opacity-85"
        />
        <div className="absolute inset-0 bg-linear-to-t from-carvao via-carvao/40 to-carvao/25" />
        <div className="relative hidden h-full flex-col justify-end p-12 text-offwhite lg:flex">
          <div className="max-w-md">
            <p className="font-titulo text-4xl leading-tight font-light text-balance">{tela.frase}</p>
            <span className="my-6 block h-px w-14 bg-dourado" />
            <p className="text-sm leading-relaxed text-offwhite/80">{tela.texto}</p>
          </div>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex">
            <LogoRaion altura={30} />
          </div>
          <p className="mb-2 text-[11px] font-medium tracking-[0.3em] text-zinc-500 uppercase">CRM para negócios que vão mais longe</p>
          <h1 className="mb-8 text-4xl font-light tracking-tight text-carvao">{titulo}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
