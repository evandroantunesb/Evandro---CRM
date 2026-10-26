"use client";

import { PlugZap, Sun } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Janela } from "@/components/janela";

export const TIPOS_NOVO_NEGOCIO = [
  { tipo: "solar", titulo: "Energia Solar", Icone: Sun },
  { tipo: "eletroposto", titulo: "Eletroposto", Icone: PlugZap },
] as const;

/** Endereço do cadastro com o tipo escolhido, preservando funil e etapa (`?funil=...&etapa=...`). */
export function hrefDoTipo(href: string, tipo: string) {
  const [caminho, consulta = ""] = href.split("?");
  const p = new URLSearchParams(consulta);
  p.set("tipo", tipo);
  return `${caminho}?${p}`;
}

/** As duas opções lado a lado: ícone grande e o nome embaixo. */
export function OpcoesTipoNegocio({ href, aoEscolher }: { href: string; aoEscolher?: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TIPOS_NOVO_NEGOCIO.map(({ tipo, titulo, Icone }, i) => (
        <Link
          key={tipo}
          href={hrefDoTipo(href, tipo)}
          onClick={aoEscolher}
          {...(i === 0 ? { "data-foco-inicial": true } : {})}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-linha bg-superficie px-3 py-6 text-center transition-[border-color,background-color,transform] duration-200 ease-raion hover:border-dourado hover:bg-dourado/5 focus-visible:border-dourado focus-visible:ring-2 focus-visible:ring-dourado/40 focus-visible:outline-none active:scale-[0.98]"
        >
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-carvao text-dourado transition-transform duration-200 ease-raion group-hover:scale-105">
            <Icone size={30} aria-hidden />
          </span>
          <span className="font-titulo text-base font-semibold text-texto">{titulo}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * "Novo negócio": com o módulo de eletroposto disponível, abre a escolha obrigatória entre energia solar e
 * eletroposto; sem ele, é só o link para o cadastro solar, como sempre foi.
 */
export function NovoNegocio({
  href = "/negocios/novo",
  eletroposto,
  className,
  children,
  "aria-label": rotulo,
}: {
  href?: string;
  eletroposto: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const [aberta, setAberta] = useState(false);
  if (!eletroposto) {
    return (
      <Link href={href} className={className} aria-label={rotulo}>
        {children}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className={className} aria-label={rotulo} aria-haspopup="dialog" onClick={() => setAberta(true)}>
        {children}
      </button>
      <Janela aberta={aberta} aoFechar={() => setAberta(false)} titulo="O que você vai vender?">
        <OpcoesTipoNegocio href={href} aoEscolher={() => setAberta(false)} />
      </Janela>
    </>
  );
}
