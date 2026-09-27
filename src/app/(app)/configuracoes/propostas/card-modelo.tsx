"use client";

import { Archive, Copy, MoreVertical, Star, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Mensagem, Selo } from "@/components/ui";
import { alternarPublicacaoModelo, arquivarModeloProposta, definirModeloPadrao, duplicarModeloProposta } from "@/lib/acoes/proposta-modelos";
import { tempoDesde } from "@/lib/formatacao";

type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  capaVariante: string;
  status: "rascunho" | "publicado" | "arquivado";
  padrao: boolean;
  atualizadoEm: string;
  blocosAtivos: number;
  blocosTotal: number;
};

const ROTULO_CAPA: Record<string, string> = { foto: "Capa foto", minimalista: "Capa minimalista", tecnica: "Capa técnica" };
const ROTULO_STATUS: Record<Modelo["status"], { texto: string; tom: "neutro" | "positivo" | "negativo" }> = {
  rascunho: { texto: "Rascunho", tom: "neutro" },
  publicado: { texto: "Publicado", tom: "positivo" },
  arquivado: { texto: "Arquivado", tom: "negativo" },
};

export function CardModelo({ modelo }: { modelo: Modelo }) {
  const [resultadoPublicar, acaoPublicar, publicando] = useActionState(alternarPublicacaoModelo, null);
  const [resultadoPadrao, acaoPadrao] = useActionState(definirModeloPadrao, null);
  const [resultadoDuplicar, acaoDuplicar, duplicando] = useActionState(duplicarModeloProposta, null);
  const [resultadoArquivar, acaoArquivar] = useActionState(arquivarModeloProposta, null);
  const [menu, setMenu] = useState(false);

  const status = ROTULO_STATUS[modelo.status];
  const arquivado = modelo.status === "arquivado";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/configuracoes/propostas/modelos/${modelo.id}`} className="font-medium text-zinc-900 hover:text-dourado">
              {modelo.nome}
            </Link>
            {modelo.padrao && (
              <span title="Modelo padrão">
                <Star size={14} className="fill-dourado text-dourado" />
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {ROTULO_CAPA[modelo.capaVariante]} · {modelo.blocosAtivos}/{modelo.blocosTotal} blocos ativos · editado {tempoDesde(modelo.atualizadoEm)}
          </p>
          {modelo.descricao && <p className="mt-1 text-sm text-zinc-600">{modelo.descricao}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Selo tom={status.tom}>{status.texto}</Selo>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Mais opções">
              <MoreVertical size={16} />
            </button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg">
                <form
                  action={acaoDuplicar}
                  onSubmit={() => setMenu(false)}
                >
                  <input type="hidden" name="id" value={modelo.id} />
                  <button type="submit" disabled={duplicando} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50">
                    <Copy size={14} /> Duplicar
                  </button>
                </form>
                {!modelo.padrao && !arquivado && (
                  <form action={acaoPadrao} onSubmit={() => setMenu(false)}>
                    <input type="hidden" name="id" value={modelo.id} />
                    <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50">
                      <Star size={14} /> Definir como padrão
                    </button>
                  </form>
                )}
                {!arquivado && (
                  <form action={acaoArquivar} onSubmit={() => setMenu(false)}>
                    <input type="hidden" name="id" value={modelo.id} />
                    <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-red-50">
                      <Archive size={14} /> Arquivar
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/configuracoes/propostas/modelos/${modelo.id}`}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-carvao hover:border-dourado"
        >
          Editar blocos
        </Link>
        <Link
          href={`/configuracoes/propostas/modelos/${modelo.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-carvao hover:border-dourado"
        >
          Pré-visualizar PDF
        </Link>
        {!arquivado && (
          <form action={acaoPublicar}>
            <input type="hidden" name="id" value={modelo.id} />
            <input type="hidden" name="publicar" value={modelo.status === "publicado" ? "0" : "1"} />
            <button
              type="submit"
              disabled={publicando}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                modelo.status === "publicado" ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "bg-carvao text-offwhite hover:bg-zinc-800"
              }`}
            >
              {modelo.status === "publicado" ? (
                <span className="flex items-center gap-1">
                  <X size={14} /> Despublicar
                </span>
              ) : publicando ? (
                "Publicando..."
              ) : (
                "Publicar"
              )}
            </button>
          </form>
        )}
      </div>
      <Mensagem resultado={resultadoPublicar ?? resultadoPadrao ?? resultadoDuplicar ?? resultadoArquivar} />
    </div>
  );
}
