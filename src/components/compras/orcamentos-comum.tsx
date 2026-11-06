"use client";

import type { ReactNode } from "react";
import { BUCKET_COMPRAS_OBRA, caminhoCompras, problemaArquivoCompras, tipoArquivoCompras } from "@/lib/compras/orcamentos-regras";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

/** Peças comuns dos orçamentos e arquivos de compra da obra. */

export type ObraCompras = { obraId: string; empresaId: string };

export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Dia (dd/mm) de um instante, no fuso de São Paulo. */
export const diaDe = (instante: string) => dataCurta(hojeEmSaoPaulo(Date.parse(instante)));
export const dinheiroBr = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function enviarArquivoCompras({ obraId, empresaId }: ObraCompras, arquivo: File): Promise<{ caminho: string; nome: string } | string> {
  const problema = problemaArquivoCompras({ nome: arquivo.name, tamanho: arquivo.size, tipoMime: arquivo.type });
  if (problema) return problema;
  const caminho = caminhoCompras(empresaId, obraId, arquivo.name);
  const { error } = await criarClienteNavegador()
    .storage.from(BUCKET_COMPRAS_OBRA)
    .upload(caminho, arquivo, { contentType: tipoArquivoCompras(arquivo.name, arquivo.type) ?? undefined });
  return error ? `Não foi possível enviar "${arquivo.name}". Tente de novo.` : { caminho, nome: arquivo.name };
}

export const arquivoDe = (form: FormData, campo: string) => {
  const a = form.get(campo);
  return a instanceof File && a.name ? a : null;
};

export function Rotulo({ texto, children, className = "" }: { texto: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-texto-2">{texto}</span>
      {children}
    </label>
  );
}

export function LinkArquivo({ nome, url }: { nome: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="min-w-0 text-xs font-medium break-all text-dourado-texto underline-offset-2 hover:underline">
      {nome}
    </a>
  ) : (
    <span className="min-w-0 text-xs break-all text-texto-2">{nome}</span>
  );
}
