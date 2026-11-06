"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Acao } from "@/components/financeiro/formularios";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { anexarArquivoCompra } from "@/lib/acoes/compras-arquivos";
import { ACEITA_ARQUIVO_COMPRAS, ROTULO_TIPO_ARQUIVO, type ArquivoCompraVM } from "@/lib/compras/orcamentos-regras";
import { numeroPedido } from "@/lib/compras/regras";
import type { ResultadoAcao } from "@/lib/tipos";
import { LinkArquivo, Rotulo, arquivoDe, diaDe, enviarArquivoCompras, type ObraCompras } from "./orcamentos-comum";

/** Arquivos de compra da obra: a lista de tudo o que foi anexado e o envio da confirmação do pedido ou de outro arquivo. */

export type PedidoOpcao = { id: string; numero: number; fornecedor: string };

/** Confirmação do pedido (de um pedido ativo) ou outro arquivo de compra. */
function AnexarArquivo({ obra, pedidos }: { obra: ObraCompras; pedidos: PedidoOpcao[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"confirmacao" | "outro">(pedidos.length ? "confirmacao" : "outro");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulario = e.currentTarget;
    const form = new FormData(formulario);
    const arquivo = arquivoDe(form, "arquivo");
    if (!arquivo) {
      setResultado({ ok: false, mensagem: "Escolha o arquivo." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const envio = await enviarArquivoCompras(obra, arquivo);
    const pedidoId = String(form.get("pedidoId") ?? "") || null;
    const r: ResultadoAcao =
      typeof envio === "string"
        ? { ok: false, mensagem: envio }
        : await anexarArquivoCompra({ obraId: obra.obraId, tipo, pedidoId, fornecedor: String(form.get("fornecedor") ?? ""), arquivo: envio });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) {
      formulario.reset();
      router.refresh();
    }
  };
  return (
    <form onSubmit={enviar} aria-label="Anexar arquivo de compra" className="grid grid-cols-1 gap-3 rounded-xl bg-superficie-2 p-3 sm:grid-cols-2 lg:grid-cols-4 md:p-4">
      <Rotulo texto="Tipo">
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "confirmacao" | "outro")} className={CLASSE_ENTRADA}>
          {pedidos.length > 0 && <option value="confirmacao">Confirmação do pedido</option>}
          <option value="outro">Outro</option>
        </select>
      </Rotulo>
      <Rotulo texto={tipo === "confirmacao" ? "Pedido" : "Pedido (opcional)"}>
        <select name="pedidoId" required={tipo === "confirmacao"} defaultValue={tipo === "confirmacao" && pedidos.length === 1 ? pedidos[0].id : ""} key={tipo} className={CLASSE_ENTRADA}>
          <option value="">{tipo === "confirmacao" ? "Escolha o pedido" : "Nenhum"}</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {numeroPedido(p.numero)} · {p.fornecedor}
            </option>
          ))}
        </select>
      </Rotulo>
      {tipo === "outro" && (
        <Rotulo texto="Fornecedor (opcional)">
          <input name="fornecedor" maxLength={120} placeholder="Nome do fornecedor" className={CLASSE_ENTRADA} />
        </Rotulo>
      )}
      <Rotulo texto="Arquivo">
        <input name="arquivo" type="file" required accept={ACEITA_ARQUIVO_COMPRAS} className={`${CLASSE_ENTRADA} w-full min-w-0 text-sm`} />
      </Rotulo>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Anexar arquivo"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/** Tudo o que foi anexado nesta obra, mais novo primeiro. */
export function ArquivosCompra({
  obra,
  arquivos,
  pedidos,
  podeEscrever,
}: {
  obra: ObraCompras;
  arquivos: ArquivoCompraVM[];
  pedidos: PedidoOpcao[];
  podeEscrever: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {podeEscrever && (
        <Acao rotulo="+ Anexar arquivo" destaque>
          <AnexarArquivo obra={obra} pedidos={pedidos} />
        </Acao>
      )}
      {arquivos.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum arquivo ainda.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-linha md:hidden">
            {arquivos.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeloTipo arquivo={a} />
                  <span className="text-xs text-texto-2 tabular-nums">{diaDe(a.enviadoEm)}</span>
                </div>
                <LinkArquivo nome={a.nome} url={a.url} />
                <p className="text-xs text-texto-2">
                  {[a.fornecedor, a.enviadoPor].filter(Boolean).join(" · ")}
                  {a.descartado && " · orçamento descartado"}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-linha md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linha text-left text-xs text-texto-2">
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Fornecedor</th>
                  <th className="px-3 py-2 font-medium">Arquivo</th>
                  <th className="px-3 py-2 font-medium">Por</th>
                  <th className="px-3 py-2 text-right font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {arquivos.map((a) => (
                  <tr key={a.id} className="border-b border-linha align-top last:border-b-0">
                    <td className="px-3 py-2">
                      <SeloTipo arquivo={a} />
                    </td>
                    <td className="px-3 py-2 text-texto">{a.fornecedor ?? "—"}</td>
                    <td className="px-3 py-2">
                      <LinkArquivo nome={a.nome} url={a.url} />
                      {a.descartado && <p className="text-xs text-texto-2">orçamento descartado</p>}
                    </td>
                    <td className="px-3 py-2 text-texto-2">{a.enviadoPor ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-texto-2 tabular-nums">{diaDe(a.enviadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SeloTipo({ arquivo }: { arquivo: ArquivoCompraVM }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">{ROTULO_TIPO_ARQUIVO[arquivo.tipo]}</span>
      {arquivo.pedidoNumero != null && <span className="text-xs text-texto-2">{numeroPedido(arquivo.pedidoNumero)}</span>}
    </span>
  );
}
