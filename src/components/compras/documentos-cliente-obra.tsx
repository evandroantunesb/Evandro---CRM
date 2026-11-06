"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Acao } from "@/components/financeiro/formularios";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { anexarDocumentoClienteCompra } from "@/lib/acoes/compras-arquivos";
import type { ClienteFaturamentoVM } from "@/lib/compras/faturamento";
import { ACEITA_ARQUIVO_COMPRAS } from "@/lib/compras/orcamentos-regras";
import { DICA_DOCUMENTO_CLIENTE, ROTULO_DOCUMENTO_CLIENTE, type DocumentoCliente } from "@/lib/documentos-cliente";
import type { ResultadoAcao } from "@/lib/tipos";
import { LinkArquivo, arquivoDe, enviarArquivoCompras, type ObraCompras } from "./orcamentos-comum";

/**
 * Dados e documentos do cliente para a distribuidora faturar o kit no nome dele (prévia aprovada "Documentos do
 * cliente"). Cada documento vem do negócio, da Engenharia ou do que Compras anexar aqui, nessa ordem.
 */

export type DocumentosClienteVM = {
  exigidos: { documento: DocumentoCliente; arquivo: { nome: string; url: string | null; origem: "negocio" | "engenharia" | "compras" } | null }[];
  outros: { descricao: string; nome: string; url: string | null }[];
};

const ORIGEM = { negocio: "Do negócio", engenharia: "Da Engenharia", compras: "Compras" } as const;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function DadosFaturamentoCliente({ cliente }: { cliente: ClienteFaturamentoVM }) {
  const campos: [string, string | null][] = [
    [cliente.pj ? "Razão social" : "Nome", cliente.nome],
    [cliente.pj ? "CNPJ" : "CPF", cliente.documento],
    ...(cliente.pj ? ([["Inscrição estadual", cliente.inscricaoEstadual]] as [string, string | null][]) : []),
    ...(!cliente.pj
      ? ([
          ["RG", cliente.rg],
          ["Nascimento", cliente.dataNascimento ? dataBr(cliente.dataNascimento) : null],
        ] as [string, string | null][])
      : []),
    ["Telefone", cliente.telefone],
    ["E-mail", cliente.email],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {campos.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-xs text-texto-2">{rotulo}</dt>
          <dd className="break-words text-texto">{valor ?? "—"}</dd>
        </div>
      ))}
      <div className="min-w-0 sm:col-span-2 lg:col-span-3">
        <dt className="text-xs text-texto-2">Endereço</dt>
        <dd className="break-words text-texto">{cliente.endereco ?? "—"}</dd>
      </div>
    </dl>
  );
}

export function DocumentosClienteObra({
  obra,
  documentos,
  podeEscrever,
  descricao = "O que a distribuidora pede para faturar no nome do cliente.",
}: {
  obra: ObraCompras;
  documentos: DocumentosClienteVM;
  podeEscrever: boolean;
  descricao?: string;
}) {
  const com = documentos.exigidos.filter((d) => d.arquivo).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-2">{descricao}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${com < documentos.exigidos.length ? "bg-dourado/20 text-dourado-texto" : "bg-zinc-100 text-zinc-700"}`}>
          {com} de {documentos.exigidos.length}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-linha">
        {documentos.exigidos.map(({ documento, arquivo }) => (
          <li key={documento} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-texto">{ROTULO_DOCUMENTO_CLIENTE[documento]}</p>
              <p className="text-xs text-texto-2">{DICA_DOCUMENTO_CLIENTE[documento]}</p>
            </div>
            {arquivo ? (
              <>
                <LinkArquivo nome={arquivo.nome} url={arquivo.url} />
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">{ORIGEM[arquivo.origem]}</span>
              </>
            ) : (
              <span className="rounded-full bg-dourado/20 px-2.5 py-0.5 text-xs font-medium text-dourado-texto">Falta</span>
            )}
            {podeEscrever && !arquivo && (
              <div className="w-full">
                <Acao rotulo="Anexar">
                  <AnexarDocumento obra={obra} documento={documento} />
                </Acao>
              </div>
            )}
          </li>
        ))}
        {documentos.outros.map((o, i) => (
          <li key={`${o.nome}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words text-texto">{o.descricao}</p>
              <p className="text-xs text-texto-2">Outro documento</p>
            </div>
            <LinkArquivo nome={o.nome} url={o.url} />
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">{ORIGEM.compras}</span>
          </li>
        ))}
      </ul>
      {podeEscrever && (
        <Acao rotulo="+ Outro documento" destaque>
          <AnexarDocumento obra={obra} documento="outro" />
        </Acao>
      )}
    </div>
  );
}

function AnexarDocumento({ obra, documento }: { obra: ObraCompras; documento: DocumentoCliente | "outro" }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const arquivo = arquivoDe(form, "arquivo");
    if (!arquivo) {
      setResultado({ ok: false, mensagem: "Escolha o arquivo." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const envio = await enviarArquivoCompras(obra, arquivo);
    const r: ResultadoAcao =
      typeof envio === "string"
        ? { ok: false, mensagem: envio }
        : await anexarDocumentoClienteCompra({ obraId: obra.obraId, documento, descricao: String(form.get("descricao") ?? ""), arquivo: envio });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.refresh();
  };
  return (
    <form onSubmit={enviar} aria-label={documento === "outro" ? "Anexar outro documento" : `Anexar ${ROTULO_DOCUMENTO_CLIENTE[documento]}`} className="flex flex-col gap-3 rounded-xl bg-superficie-2 p-3 sm:flex-row sm:items-end">
      {documento === "outro" && (
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Que documento é</span>
          <input name="descricao" required minLength={2} maxLength={120} placeholder="Ex.: contrato social" className={CLASSE_ENTRADA} />
        </label>
      )}
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Arquivo</span>
        <input name="arquivo" type="file" required accept={ACEITA_ARQUIVO_COMPRAS} className={`${CLASSE_ENTRADA} w-full min-w-0 text-sm`} />
      </label>
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Enviando..." : "Anexar"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
