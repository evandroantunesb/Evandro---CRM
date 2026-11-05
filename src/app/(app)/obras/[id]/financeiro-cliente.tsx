"use client";

import type { ReactNode } from "react";
import { TOM_SELO, dataCompleta, type Obra } from "@/components/financeiro/comum";
import { FormNfCliente } from "@/components/financeiro/formularios";
import { formatarMoeda } from "@/lib/formatacao";
import type { NfClienteVM, PagamentoClienteVM } from "@/lib/obras/financeiro";

/** Cartões "Pagamento do cliente" e "Nota fiscal do cliente" da ficha da obra (desenho "Ficha da obra · Administrativo"). */

export function PagamentoCliente({ cliente }: { cliente: PagamentoClienteVM }) {
  const linhas: [string, ReactNode][] = [
    ["Condição", cliente.condicao ?? "Não registrada no contrato"],
    ["Valor", cliente.valor == null ? "—" : <span className="tabular-nums">{formatarMoeda(cliente.valor)}</span>],
    ["Confirmado por", cliente.confirmadoPor ? `${cliente.confirmadoPor}${cliente.confirmadoEm ? ` · ${dataCompleta(cliente.confirmadoEm.slice(0, 10))}` : ""}` : "—"],
  ];
  if (cliente.comprovanteNome)
    linhas.push([
      "Comprovante",
      cliente.comprovanteUrl ? (
        <a href={cliente.comprovanteUrl} target="_blank" rel="noreferrer" className="break-all text-dourado-texto underline-offset-2 hover:underline">
          {cliente.comprovanteNome}
        </a>
      ) : (
        cliente.comprovanteNome
      ),
    ]);
  return (
    <div className="flex flex-col gap-3">
      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${cliente.situacao === "confirmado" ? TOM_SELO.pago : "bg-erro/10 text-erro"}`}>
        {cliente.situacao === "confirmado" ? "Confirmado" : "Estornado"}
      </span>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-texto-2">{rotulo}</dt>
            <dd className="text-texto">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-texto-2">Confirmam: Administrativo, Operacional, gestor e admin.</p>
    </div>
  );
}

export function NotaFiscalCliente({ obra, nf, podeAnexar }: { obra: Obra; nf: NfClienteVM | null; podeAnexar: boolean }) {
  const formulario = <FormNfCliente obra={obra} substituir={nf != null} />;
  return (
    <div className="flex flex-col gap-3">
      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${nf ? TOM_SELO.pago : TOM_SELO.vencido}`}>{nf ? "Anexada" : "Pendente"}</span>
      {nf ? (
        <p className="text-sm text-texto">
          {nf.url ? (
            <a href={nf.url} target="_blank" rel="noreferrer" className="break-all text-dourado-texto underline-offset-2 hover:underline">
              {nf.nome}
            </a>
          ) : (
            nf.nome
          )}
          <span className="text-texto-2"> · {dataCompleta(nf.anexadaEm.slice(0, 10))}</span>
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-texto-2">Anexe a nota emitida para o cliente. Ela conclui o marco &quot;NF do cliente&quot; da obra.</p>
      )}
      {podeAnexar &&
        (nf ? (
          <details>
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-texto-2 underline select-none hover:text-texto">Substituir a nota</summary>
            <div className="mt-2">{formulario}</div>
          </details>
        ) : (
          formulario
        ))}
    </div>
  );
}
