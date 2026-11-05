"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { INFORMAR_PAGAMENTO, PAGAMENTOS_A_CONFIRMAR } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Pagamento informado pelo vendedor (20261113100000_aviso_pagamento_vendedor.sql). Toda a autorização está nas
 * RPCs `security definer`; a checagem de papel aqui só evita uma ida ao banco — nunca é a barreira.
 */

const id = z.string().uuid();
const negocioOpcional = z.union([id, z.literal("")]).optional();

function revalidar(negocioId?: string) {
  revalidatePath("/financeiro");
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
}

const esquemaInformar = z.object({
  negocioId: id,
  contratoId: id,
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento."),
  observacao: z.string().trim().max(500, "Observação muito longa (máximo 500 caracteres)."),
  caminho: z.string().min(1).max(400),
  nome: z.string().trim().min(1).max(200),
});

/** Registra o aviso depois que o navegador enviou o comprovante ao Storage (arquivo nunca passa por Server Action). */
export async function informarPagamento(dados: z.input<typeof esquemaInformar>): Promise<ResultadoAcao> {
  await exigirPapel(...INFORMAR_PAGAMENTO);
  const d = esquemaInformar.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("informar_pagamento", {
    p_contrato_id: d.data.contratoId,
    p_data_pagamento: d.data.dataPagamento,
    p_observacao: d.data.observacao,
    p_caminho: d.data.caminho,
    p_nome: d.data.nome,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível informar o pagamento.") };
  revalidar(d.data.negocioId);
  return { ok: true, mensagem: "Pagamento informado. Agora é só aguardar a confirmação." };
}

export async function cancelarAvisoPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...INFORMAR_PAGAMENTO);
  const d = z.object({ negocioId: id, avisoId: id }).safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_aviso_pagamento", { p_aviso_id: d.data.avisoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível cancelar o aviso.") };
  revalidar(d.data.negocioId);
  return { ok: true, mensagem: "Aviso cancelado." };
}

/** Quem confere não encontrou o pagamento: devolve ao vendedor, com motivo. */
export async function devolverAvisoPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...PAGAMENTOS_A_CONFIRMAR);
  const d = z
    .object({
      avisoId: id,
      negocioId: negocioOpcional,
      motivo: z.string().trim().min(1, "Informe por que o pagamento não foi confirmado.").max(500, "Motivo muito longo (máximo 500 caracteres)."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("devolver_aviso_pagamento", { p_aviso_id: d.data.avisoId, p_motivo: d.data.motivo });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível devolver o aviso.") };
  revalidar(d.data.negocioId || undefined);
  return { ok: true, mensagem: "Devolvido ao vendedor." };
}

/** Confirma pela lista "Pagamentos a confirmar" (inclui o Operacional; a RPC exige aviso aberto para ele). */
export async function confirmarPagamentoInformado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...PAGAMENTOS_A_CONFIRMAR);
  const d = z.object({ contratoId: id, negocioId: negocioOpcional }).safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_pagamento", { p_contrato_id: d.data.contratoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível confirmar o pagamento.") };
  revalidar(d.data.negocioId || undefined);
  return { ok: true, mensagem: "Pagamento confirmado." };
}
