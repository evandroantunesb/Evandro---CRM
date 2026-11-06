"use server";

import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";
import { revalidarCompras } from "./compras-comum";

/*
 * Compras: orçamentos, arquivos e documentos do cliente da obra (20261126100000_compras_orcamentos.sql e
 * 20261127100000_compras_pdf_documentos.sql). Cada ação só valida a forma e chama a RPC; quem pode e o que vale ficam
 * no banco. Arquivo nunca passa por Server Action: o navegador envia ao Storage e a ação recebe só o caminho.
 */

const uuid = z.string().uuid();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const dinheiro = z.number({ message: "Valor inválido." }).finite().min(0, "Valor inválido.");

async function chamar(obraId: string, rpc: () => PromiseLike<{ error: unknown }>, padrao: string, sucesso: string): Promise<ResultadoAcao> {
  const { error } = await rpc();
  if (error) return { ok: false, mensagem: mensagemErro(error as never, padrao) };
  revalidarCompras(obraId);
  return { ok: true, mensagem: sucesso };
}


const arquivo = z.object({ caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) });
const textoOpcional = (max: number, msg: string) => z.string().trim().max(max, msg);

const esquemaDadosOrcamento = z
  .object({
    obraId: uuid,
    fornecedor: z.string().trim().min(2, "Informe o fornecedor.").max(120, "Nome do fornecedor muito longo."),
    valor: z.number({ message: "Valor inválido." }).finite().positive("Informe o valor total do orçamento."),
    cobertura: z.enum(["kit_completo", "parte"], "Escolha os itens cobertos."),
    itens: textoOpcional(200, "Descrição dos itens muito longa."),
    entregaPrevista: data,
    validoAte: data,
    condicaoPagamento: textoOpcional(60, "Condição de pagamento muito longa."),
    observacao: textoOpcional(300, "Observação muito longa."),
    freteModalidade: z.enum(["cif", "fob"], "Escolha o frete: CIF ou FOB."),
    frete: dinheiro,
  })
  .refine((d) => d.cobertura === "kit_completo" || d.itens.length >= 2, { message: "Diga quais itens do kit o orçamento cobre.", path: ["itens"] });

const paramsOrcamento = (d: z.output<typeof esquemaDadosOrcamento>) => ({
  p_fornecedor: d.fornecedor,
  p_valor: d.valor,
  p_cobertura: d.cobertura,
  p_itens: d.cobertura === "parte" ? d.itens : "",
  p_entrega_prevista: d.entregaPrevista,
  p_valido_ate: d.validoAte,
  p_condicao_pagamento: d.condicaoPagamento,
  p_observacao: d.observacao,
  p_frete_modalidade: d.freteModalidade,
  p_frete: d.freteModalidade === "cif" ? 0 : d.frete,
});

/** Depois que o navegador enviou o arquivo ao Storage. */
export async function anexarOrcamentoCompra(dados: z.input<typeof esquemaDadosOrcamento> & { arquivo: z.input<typeof arquivo> }): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaDadosOrcamento.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const a = arquivo.safeParse(dados.arquivo);
  if (!a.success) return { ok: false, mensagem: "Envie o arquivo do orçamento." };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("anexar_orcamento_compra", { p_obra_id: d.data.obraId, ...paramsOrcamento(d.data), p_caminho: a.data.caminho, p_nome: a.data.nome }),
    "Não foi possível anexar o orçamento.",
    "Orçamento anexado.",
  );
}

export async function editarOrcamentoCompra(dados: z.input<typeof esquemaDadosOrcamento> & { orcamentoId: string }): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaDadosOrcamento.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  if (!uuid.safeParse(dados.orcamentoId).success) return { ok: false, mensagem: "Orçamento inválido." };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("editar_orcamento_compra", { p_orcamento_id: dados.orcamentoId, ...paramsOrcamento(d.data) }),
    "Não foi possível salvar o orçamento.",
    "Orçamento salvo.",
  );
}

const esquemaDescartar = z.object({
  obraId: uuid,
  orcamentoId: uuid,
  motivo: z.string().trim().min(3, "Explique o motivo (pelo menos 3 caracteres).").max(300, "Motivo muito longo."),
});

export async function descartarOrcamentoCompra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaDescartar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("descartar_orcamento_compra", { p_orcamento_id: d.data.orcamentoId, p_motivo: d.data.motivo }),
    "Não foi possível descartar o orçamento.",
    "Orçamento descartado.",
  );
}

const esquemaArquivo = z
  .object({
    obraId: uuid,
    tipo: z.enum(["confirmacao", "outro"], "Escolha o tipo do arquivo."),
    pedidoId: uuid.nullable(),
    fornecedor: textoOpcional(120, "Nome do fornecedor muito longo."),
    arquivo,
  })
  .refine((d) => d.tipo === "outro" || d.pedidoId != null, { message: "Escolha o pedido desta confirmação.", path: ["pedidoId"] })
  .refine((d) => d.fornecedor.length === 0 || d.fornecedor.length >= 2, { message: "Informe o fornecedor (pelo menos 2 caracteres).", path: ["fornecedor"] });

/** Confirmação do pedido ou outro arquivo de compra, depois que o navegador enviou o arquivo ao Storage. */
export async function anexarArquivoCompra(dados: z.input<typeof esquemaArquivo>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaArquivo.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("anexar_arquivo_compra", {
        p_obra_id: d.data.obraId,
        p_tipo: d.data.tipo,
        p_caminho: d.data.arquivo.caminho,
        p_nome: d.data.arquivo.nome,
        ...(d.data.pedidoId ? { p_pedido_id: d.data.pedidoId } : {}),
        ...(d.data.tipo === "outro" && d.data.fornecedor ? { p_fornecedor: d.data.fornecedor } : {}),
      }),
    "Não foi possível anexar o arquivo.",
    "Arquivo anexado.",
  );
}

const esquemaDocumento = z
  .object({
    obraId: uuid,
    documento: z.enum(["documento_foto", "comprovante_residencia", "cartao_cnpj", "outro"], "Escolha o documento."),
    descricao: textoOpcional(120, "Descrição muito longa."),
    arquivo,
  })
  .refine((d) => d.documento !== "outro" || d.descricao.length >= 2, { message: "Diga que documento é.", path: ["descricao"] });

/** Documento do cliente que faltou no negócio e na Engenharia, depois que o navegador enviou o arquivo ao Storage. */
export async function anexarDocumentoClienteCompra(dados: z.input<typeof esquemaDocumento>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaDocumento.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("anexar_documento_cliente_compra", {
        p_obra_id: d.data.obraId,
        p_documento: d.data.documento,
        p_caminho: d.data.arquivo.caminho,
        p_nome: d.data.arquivo.nome,
        ...(d.data.documento === "outro" ? { p_descricao: d.data.descricao } : {}),
      }),
    "Não foi possível anexar o documento.",
    "Documento anexado.",
  );
}

