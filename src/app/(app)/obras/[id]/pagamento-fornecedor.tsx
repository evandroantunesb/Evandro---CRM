"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { autorizarPagamentoFornecedor, registrarArquivoPagamentoFornecedor } from "@/lib/acoes/pagamento-fornecedor";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { DocumentoComprasVM } from "./compras";

export type PagamentoFornecedorVM = {
  id: string;
  pedidoId: string;
  versao: number;
  valorAutorizado: number;
  justificativa: string | null;
  autorizadoEm: string;
  pagoEm: string | null;
  nfEm: string | null;
};

const MIME = ["application/pdf", "image/png", "image/jpeg"];
const EXTENSAO: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

export function PagamentoFornecedor({ obraId, empresaId, documentos, pagamentos, podeEditar }: {
  obraId: string;
  empresaId: string;
  documentos: DocumentoComprasVM[];
  pagamentos: PagamentoFornecedorVM[];
  podeEditar: boolean;
}) {
  const ultimoOrcamento = documentos.filter((d) => d.tipo === "orcamento").sort((a, b) => b.versao - a.versao)[0];
  const pedido = documentos.find((d) => d.tipo === "pedido" && d.orcamentoId === ultimoOrcamento?.id);
  const autorizacoes = pagamentos.filter((p) => p.pedidoId === pedido?.id).sort((a, b) => b.versao - a.versao);
  const atual = autorizacoes[0];

  return <div className="flex flex-col gap-4 text-sm">
    {!pedido && <p className="text-zinc-600">Aguardando o pedido vinculado ao orçamento técnico aprovado.</p>}
    {pedido && <div className="flex flex-wrap items-center gap-2">
      <span>Pedido de compra v{pedido.versao} · {pedido.fornecedor}</span>
      <Selo tom={!atual ? "atencao" : atual.nfEm ? "neutro" : atual.pagoEm ? "atencao" : "atencao"}>
        {!atual ? "Aguardando autorização" : atual.nfEm ? "Nota fiscal anexada" : atual.pagoEm ? "Pago; aguardando nota" : "Autorizado; aguardando comprovante"}
      </Selo>
    </div>}

    {pedido && podeEditar && (!atual || !atual.pagoEm) &&
      <AutorizarPagamento key={`${pedido.id}-${atual?.id ?? "novo"}`} obraId={obraId} pedidoId={pedido.id} atual={atual ?? null} />}
    {atual && podeEditar && !atual.pagoEm &&
      <EnviarArquivoFinanceiro key={`${atual.id}-comprovante`} empresaId={empresaId} obraId={obraId} pagamentoId={atual.id} tipo="comprovante" valorAutorizado={atual.valorAutorizado} />}
    {atual?.pagoEm && podeEditar && !atual.nfEm &&
      <EnviarArquivoFinanceiro key={`${atual.id}-nf`} empresaId={empresaId} obraId={obraId} pagamentoId={atual.id} tipo="nota_fiscal" valorAutorizado={atual.valorAutorizado} />}

    {pagamentos.length > 0 && <div className="border-t border-zinc-200 pt-3">
      <h3 className="mb-2 font-semibold text-carvao">Histórico financeiro dos pedidos</h3>
      <ul className="flex flex-col gap-2">
        {[...pagamentos].sort((a, b) => b.autorizadoEm.localeCompare(a.autorizadoEm)).map((p) => <li key={p.id} className="rounded-lg border border-zinc-100 p-2">
          <span className="font-medium">Autorização v{p.versao}</span>{" · "}
          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valorAutorizado)}</span>
          {p.justificativa && <p className="text-zinc-600">Motivo do ajuste: {p.justificativa}</p>}
          <div className="mt-1 flex flex-wrap gap-3">
            {p.pagoEm && <a href={`/obras/financeiro/${p.id}/comprovante`} target="_blank" rel="noreferrer" className="text-amber-700 underline">Comprovante</a>}
            {p.nfEm && <a href={`/obras/financeiro/${p.id}/nota_fiscal`} target="_blank" rel="noreferrer" className="text-amber-700 underline">Nota fiscal</a>}
          </div>
        </li>)}
      </ul>
    </div>}
  </div>;
}

function AutorizarPagamento({ obraId, pedidoId, atual }: { obraId: string; pedidoId: string; atual: PagamentoFornecedorVM | null }) {
  const [resultado, acao, pendente] = useActionState(autorizarPagamentoFornecedor, null);
  return <form action={acao} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
    <h3 className="font-semibold text-carvao">{atual ? "Alterar valor autorizado" : "Autorizar pagamento ao fornecedor"}</h3>
    <input type="hidden" name="obraId" value={obraId} />
    <input type="hidden" name="pedidoId" value={pedidoId} />
    <label className="flex flex-col gap-1">Valor autorizado (R$)
      <input name="valor" type="number" min="0.01" step="0.01" required defaultValue={atual?.valorAutorizado ?? ""} className="rounded-lg border border-zinc-300 p-2" />
    </label>
    {atual && <label className="flex flex-col gap-1">Justificativa da nova autorização
      <textarea name="justificativa" rows={2} required maxLength={1000} className="rounded-lg border border-zinc-300 p-2" />
    </label>}
    <Botao type="submit" disabled={pendente}>{pendente ? "Salvando..." : atual ? "Registrar nova autorização" : "Autorizar pagamento"}</Botao>
    {resultado && <Mensagem resultado={resultado} />}
  </form>;
}

function EnviarArquivoFinanceiro({ empresaId, obraId, pagamentoId, tipo, valorAutorizado }: {
  empresaId: string; obraId: string; pagamentoId: string;
  tipo: "comprovante" | "nota_fiscal"; valorAutorizado: number;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const arquivo = dados.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size) return setResultado({ ok: false, mensagem: "Escolha um arquivo." });
    if (!MIME.includes(arquivo.type) || arquivo.size > 20 * 1024 * 1024) return setResultado({ ok: false, mensagem: "Envie PDF, PNG ou JPEG com até 20 MB." });
    setEnviando(true);
    setResultado(null);
    const caminho = `${empresaId}/${obraId}/financeiro/${crypto.randomUUID()}.${EXTENSAO[arquivo.type]}`;
    const supabase = criarClienteNavegador();
    const { error } = await supabase.storage.from("obra-compras").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) {
      setResultado({ ok: false, mensagem: "Não foi possível enviar o arquivo." });
      setEnviando(false);
      return;
    }
    const resposta = await registrarArquivoPagamentoFornecedor({
      obraId, pagamentoId, tipo, caminho, nome: arquivo.name,
      valor: tipo === "comprovante" ? dados.get("valor")?.toString() ?? "" : "",
    });
    setResultado(resposta);
    setEnviando(false);
    if (resposta?.ok) {
      formulario.reset();
      router.refresh();
    }
  }

  return <form onSubmit={enviar} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
    <h3 className="font-semibold text-carvao">{tipo === "comprovante" ? "Anexar comprovante de pagamento" : "Anexar nota fiscal do fornecedor"}</h3>
    {tipo === "comprovante" && <label className="flex flex-col gap-1">Valor pago (R$)
      <input name="valor" type="number" min="0.01" step="0.01" required defaultValue={valorAutorizado} className="rounded-lg border border-zinc-300 p-2" />
    </label>}
    <label className="flex flex-col gap-1">Arquivo PDF ou imagem
      <input name="arquivo" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="min-w-0" />
    </label>
    <Botao type="submit" disabled={enviando}>{enviando ? "Enviando..." : tipo === "comprovante" ? "Registrar comprovante" : "Registrar nota fiscal"}</Botao>
    {resultado && <Mensagem resultado={resultado} />}
  </form>;
}
