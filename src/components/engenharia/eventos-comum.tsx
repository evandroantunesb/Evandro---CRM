"use client";

import { Paperclip } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { metaArquivo, nomeSeguro, problemaArquivo } from "@/lib/anexos-regras";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { ResultadoAcao } from "@/lib/tipos";

/** Partes comuns aos registros com linha do tempo da Engenharia (protocolo e vistoria). */

export const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

type RegistrarArquivo = (dados: { obraId: string; eventoId: string; caminho: string; nome: string }) => Promise<ResultadoAcao>;

/** Envia os arquivos à pasta da obra e liga cada um ao evento. Devolve a primeira falha, ou null. */
async function anexarAoEvento(
  registrar: RegistrarArquivo,
  pasta: string,
  obraId: string,
  eventoId: string,
  arquivos: File[],
  bucket: string,
): Promise<string | null> {
  const supabase = criarClienteNavegador();
  let falha: string | null = null;
  for (const arquivo of arquivos) {
    const problema = problemaArquivo(metaArquivo(arquivo));
    if (problema) {
      falha ??= problema;
      continue;
    }
    const caminho = `${pasta}/${nomeSeguro(arquivo.name)}`;
    const { error } = await supabase.storage.from(bucket).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
    if (error) {
      falha ??= `Não foi possível enviar "${arquivo.name}".`;
      continue;
    }
    const r = await registrar({ obraId, eventoId, caminho, nome: arquivo.name });
    if (!r?.ok) falha ??= r?.mensagem ?? `Não foi possível registrar "${arquivo.name}".`;
  }
  return falha;
}

/** Depois que o registro devolve o evento, envia os arquivos escolhidos e atualiza a tela. */
export function useEnvioDepois(
  resultado: { ok: boolean; eventoId?: string } | null,
  registrar: RegistrarArquivo,
  pasta: string,
  obraId: string,
  arquivos: File[],
  setErro: (e: string | null) => void,
  atualizar: () => void,
  // Protocolo: documentos da Engenharia; vistoria: `vistoria-arquivos` (o Operacional também lê e envia).
  bucket: string = BUCKET_DOCUMENTOS_ENGENHARIA,
) {
  useEffect(() => {
    if (!resultado?.ok || !resultado.eventoId || arquivos.length === 0) return;
    let ativo = true;
    anexarAoEvento(registrar, pasta, obraId, resultado.eventoId, arquivos, bucket).then((falha) => {
      if (!ativo) return;
      setErro(falha);
      atualizar();
    });
    return () => {
      ativo = false;
    };
    // Um envio por resultado: os arquivos são os do momento do registro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);
}

export function Rotulo({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {texto}
      {children}
    </label>
  );
}

/** Link para abrir um arquivo do evento (rota que confere a RLS e assina por 60 segundos). */
export function LinkArquivo({ href, nome }: { href: string; nome: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-1 text-xs text-amber-700 hover:underline">
      <Paperclip aria-hidden className="size-3.5" />
      {nome}
    </a>
  );
}
