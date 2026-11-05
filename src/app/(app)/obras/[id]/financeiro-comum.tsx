"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CLASSE_ENTRADA } from "@/components/ui";
import { BUCKET_FINANCEIRO_OBRA, TIPOS_ANEXO_FINANCEIRO, caminhoFinanceiro, problemaAnexoFinanceiro } from "@/lib/obras/financeiro-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { ResultadoAcao } from "@/lib/tipos";

/** Peças comuns dos cartões do financeiro da obra (envio de arquivo ao Storage e selos). */

export const dataCompleta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ACEITA = TIPOS_ANEXO_FINANCEIRO.join(",");

export type Obra = { obraId: string; empresaId: string };

/** Envia o arquivo à pasta da obra; devolve o caminho e o nome ou a mensagem do problema. */
export async function enviarArquivo({ obraId, empresaId }: Obra, tipo: "fornecedor" | "cliente", arquivo: File): Promise<{ caminho: string; nome: string } | string> {
  const problema = problemaAnexoFinanceiro({ nome: arquivo.name, tamanho: arquivo.size, tipoMime: arquivo.type });
  if (problema) return problema;
  const caminho = caminhoFinanceiro(empresaId, obraId, tipo, arquivo.name);
  const { error } = await criarClienteNavegador().storage.from(BUCKET_FINANCEIRO_OBRA).upload(caminho, arquivo, { contentType: arquivo.type });
  return error ? `Não foi possível enviar "${arquivo.name}". Tente de novo.` : { caminho, nome: arquivo.name };
}

export const arquivoDe = (form: FormData, campo: string) => {
  const a = form.get(campo);
  return a instanceof File && a.name ? a : null;
};

export function CampoArquivo({ rotulo, name, required, ajuda }: { rotulo: string; name: string; required?: boolean; ajuda?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-texto-2">{rotulo}</span>
      <input name={name} type="file" accept={ACEITA} required={required} className={CLASSE_ENTRADA} />
      {ajuda && <span className="text-xs text-texto-2">{ajuda}</span>}
    </label>
  );
}

export const TOM_SELO = {
  pago: "bg-energia/10 text-energia",
  vencido: "bg-dourado/20 text-dourado-texto",
  aberto: "bg-zinc-100 text-zinc-700",
  encerrado: "bg-zinc-100 text-zinc-500 line-through decoration-zinc-400/60",
} as const;

/** Envio com arquivo: o navegador sobe ao Storage e a ação recebe só o caminho. */
export function useEnvioComArquivo(executar: (form: FormData) => Promise<ResultadoAcao>) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEnviando(true);
    setResultado(null);
    const r = await executar(new FormData(e.currentTarget));
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.refresh();
  };
  return { enviar, enviando, resultado };
}
