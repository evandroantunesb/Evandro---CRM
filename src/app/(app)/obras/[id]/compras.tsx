"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { registrarDocumentoComprasObra, revisarOrcamentoObra } from "@/lib/acoes/compras-obra";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

export type DocumentoComprasVM = {
  id: string;
  tipo: "orcamento" | "pedido";
  versao: number;
  nome: string;
  fornecedor: string;
  valor: number | null;
  revisao: "pendente" | "aprovado" | "reprovado" | null;
  motivoReprovacao: string | null;
  orcamentoId: string | null;
  anexadoEm: string;
};

const TIPOS = ["application/pdf", "image/png", "image/jpeg"];
const LIMITE = 20 * 1024 * 1024;
const EXTENSAO: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

export function ComprasObra({ obraId, empresaId, documentos, podeAnexar, podeRevisar }: {
  obraId: string;
  empresaId: string;
  documentos: DocumentoComprasVM[];
  podeAnexar: boolean;
  podeRevisar: boolean;
}) {
  const orcamentos = documentos.filter((d) => d.tipo === "orcamento").sort((a, b) => b.versao - a.versao);
  const ultimo = orcamentos[0];
  const pedidos = documentos.filter((d) => d.tipo === "pedido").sort((a, b) => b.versao - a.versao);
  const pedidoAtual = pedidos.find((p) => p.orcamentoId === ultimo?.id);
  const podePedir = podeAnexar && ultimo?.revisao === "aprovado" && !pedidoAtual;

  return <div className="flex flex-col gap-5">
    <p className="text-sm text-zinc-600">O orçamento é gerado com o fornecedor e anexado aqui. O responsável técnico principal da obra confere o kit antes do pedido.</p>
    {ultimo ? <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Orçamento atual: versão {ultimo.versao}</span>
      <Selo tom={ultimo.revisao === "reprovado" ? "negativo" : ultimo.revisao === "pendente" ? "atencao" : "neutro"}>
        {{ pendente: "Aguardando conferência", aprovado: "Aprovado tecnicamente", reprovado: "Devolvido a Compras" }[ultimo.revisao ?? "pendente"]}
      </Selo>
      {pedidoAtual && <Selo>Pedido anexado</Selo>}
    </div> : <p className="text-sm text-zinc-600">Nenhum orçamento anexado.</p>}

    {podeRevisar && ultimo?.revisao === "pendente" && <RevisarOrcamento key={ultimo.id} obraId={obraId} documentoId={ultimo.id} />}
    {podeAnexar && <EnviarDocumento key={`${obraId}-orcamento`} empresaId={empresaId} obraId={obraId} tipo="orcamento" />}
    {podePedir && <EnviarDocumento key={`${obraId}-pedido-${ultimo.id}`} empresaId={empresaId} obraId={obraId} tipo="pedido" />}
    {ultimo?.revisao === "reprovado" && ultimo.motivoReprovacao &&
      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Motivo da devolução: {ultimo.motivoReprovacao}</p>}

    {documentos.length > 0 && <div className="border-t border-zinc-200 pt-3">
      <h3 className="mb-2 text-sm font-semibold text-carvao">Histórico de documentos</h3>
      <ul className="flex flex-col gap-2">
        {[...documentos].sort((a, b) => b.anexadoEm.localeCompare(a.anexadoEm)).map((doc) => <li key={doc.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{doc.tipo === "orcamento" ? "Orçamento" : "Pedido"} v{doc.versao}</span>
          <a href={`/obras/arquivos/${doc.id}`} target="_blank" rel="noreferrer" className="break-all text-amber-700 underline">{doc.nome}</a>
          <span className="text-zinc-600">{doc.fornecedor}</span>
          {doc.valor != null && <span className="text-zinc-600">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(doc.valor)}</span>}
          {doc.tipo === "orcamento" && <span className="text-zinc-500">{doc.revisao === "aprovado" ? "Aprovado" : doc.revisao === "reprovado" ? "Reprovado" : "Pendente"}</span>}
        </li>)}
      </ul>
    </div>}
  </div>;
}

function EnviarDocumento({ empresaId, obraId, tipo }: { empresaId: string; obraId: string; tipo: "orcamento" | "pedido" }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const arquivo = dados.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size) return setResultado({ ok: false, mensagem: "Escolha um arquivo." });
    if (!TIPOS.includes(arquivo.type) || arquivo.size > LIMITE) return setResultado({ ok: false, mensagem: "Envie PDF, PNG ou JPEG com até 20 MB." });
    setEnviando(true);
    setResultado(null);
    const caminho = `${empresaId}/${obraId}/compras/${crypto.randomUUID()}.${EXTENSAO[arquivo.type]}`;
    const supabase = criarClienteNavegador();
    const { error } = await supabase.storage.from("obra-compras").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) {
      setResultado({ ok: false, mensagem: "Não foi possível enviar o arquivo." });
      setEnviando(false);
      return;
    }
    const resposta = await registrarDocumentoComprasObra({
      obraId, tipo, caminho, nome: arquivo.name,
      fornecedor: dados.get("fornecedor")?.toString() ?? "",
      valor: dados.get("valor")?.toString() ?? "",
    });
    setResultado(resposta);
    setEnviando(false);
    if (resposta?.ok) {
      formulario.reset();
      router.refresh();
    }
  }

  return <form onSubmit={enviar} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
    <h3 className="font-semibold text-carvao">{tipo === "orcamento" ? "Anexar orçamento do fornecedor" : "Anexar pedido de compra"}</h3>
    {tipo === "orcamento" && <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">Fornecedor<input name="fornecedor" required maxLength={200} className="rounded-lg border border-zinc-300 p-2" /></label>
      <label className="flex flex-col gap-1">Valor do kit (opcional)<input name="valor" type="number" min="0" step="0.01" className="rounded-lg border border-zinc-300 p-2" /></label>
    </div>}
    <label className="flex flex-col gap-1">Arquivo PDF ou imagem<input name="arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required className="min-w-0" /></label>
    <Botao type="submit" disabled={enviando}>{enviando ? "Enviando..." : tipo === "orcamento" ? "Enviar para conferência" : "Registrar pedido"}</Botao>
    {resultado && <Mensagem resultado={resultado} />}
  </form>;
}

function RevisarOrcamento({ obraId, documentoId }: { obraId: string; documentoId: string }) {
  const [resultado, acao, pendente] = useActionState(revisarOrcamentoObra, null);
  return <form action={acao} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-sm">
    <h3 className="font-semibold text-carvao">Conferência técnica do kit</h3>
    <p className="text-zinc-600">Confira as especificações do orçamento com os dados técnicos da obra. Comentários da engenharia podem apoiar sua decisão.</p>
    <input type="hidden" name="obraId" value={obraId} />
    <input type="hidden" name="documentoId" value={documentoId} />
    <label className="flex flex-col gap-1">Motivo da devolução<textarea name="motivo" rows={2} maxLength={1000} className="rounded-lg border border-zinc-300 p-2" /></label>
    <div className="flex flex-wrap gap-2">
      <Botao type="submit" name="decisao" value="aprovar" disabled={pendente}>Aprovar kit</Botao>
      <Botao type="submit" name="decisao" value="reprovar" variante="secundario" disabled={pendente}>Devolver a Compras</Botao>
    </div>
    {resultado && <Mensagem resultado={resultado} />}
  </form>;
}
