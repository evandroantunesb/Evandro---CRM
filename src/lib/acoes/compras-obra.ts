"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const uuid = z.string().uuid();
const documento = z.object({
  obraId: uuid,
  tipo: z.enum(["orcamento", "pedido"]),
  caminho: z.string().min(1).max(250),
  nome: z.string().trim().min(1).max(200),
  fornecedor: z.string().trim().max(200).optional(),
  valor: z.string().trim().optional(),
});

export async function registrarDocumentoComprasObra(dados: unknown): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const validado = documento.safeParse(dados);
  if (!validado.success) return { ok: false, mensagem: validado.error.issues[0].message };
  const d = validado.data;
  if (d.tipo === "orcamento" && !d.fornecedor) return { ok: false, mensagem: "Informe o fornecedor." };
  const valor = d.valor ? Number(d.valor) : null;
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return { ok: false, mensagem: "Valor do orçamento inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_documento_compras_obra", {
    p_obra_id: d.obraId,
    p_tipo: d.tipo,
    p_caminho: d.caminho,
    p_nome: d.nome,
    p_fornecedor: d.tipo === "orcamento" ? d.fornecedor : undefined,
    p_valor: d.tipo === "orcamento" ? valor ?? undefined : undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o documento de compras.") };
  revalidatePath(`/obras/${d.obraId}`);
  revalidatePath("/obras");
  return { ok: true, mensagem: d.tipo === "orcamento" ? "Orçamento enviado para conferência técnica." : "Pedido de compra anexado." };
}

const revisao = z.object({
  obraId: uuid,
  documentoId: uuid,
  decisao: z.enum(["aprovar", "reprovar"]),
  motivo: z.string().trim().max(1000).optional(),
});

export async function revisarOrcamentoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const validado = revisao.safeParse(Object.fromEntries(formData));
  if (!validado.success) return { ok: false, mensagem: validado.error.issues[0].message };
  const d = validado.data;
  if (d.decisao === "reprovar" && !d.motivo) return { ok: false, mensagem: "Informe o motivo da reprovação." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("revisar_orcamento_obra", {
    p_documento_id: d.documentoId,
    p_aprovar: d.decisao === "aprovar",
    p_motivo: d.decisao === "reprovar" ? d.motivo : undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível revisar o orçamento.") };
  revalidatePath(`/obras/${d.obraId}`);
  return { ok: true, mensagem: d.decisao === "aprovar" ? "Orçamento aprovado tecnicamente." : "Orçamento devolvido para Compras." };
}
