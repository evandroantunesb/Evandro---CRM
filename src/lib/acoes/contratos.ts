"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { validarModeloContrato } from "@/lib/contrato";
import { atualizarStatusContratoComCliente, gerarContratoComCliente } from "@/lib/contratos-geracao";
import { exigirPapel } from "@/lib/sessao";
import { CONFIRMAR_PAGAMENTO, EDITAR_MODELO_CONTRATO, NEGOCIOS, PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { STATUS_CONTRATO, type ResultadoAcao } from "@/lib/tipos";

export async function salvarModeloContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...EDITAR_MODELO_CONTRATO);
  const conteudo = z.string().max(20000, "Modelo muito longo").safeParse(formData.get("conteudo"));
  if (!conteudo.success) return { ok: false, mensagem: "Modelo inválido." };
  // Marcador desconhecido apareceria cru no contrato do cliente: recusa ao salvar.
  const validacao = validarModeloContrato(conteudo.data);
  if (validacao.desconhecidos.length) {
    return { ok: false, mensagem: `Campos desconhecidos no modelo: ${validacao.desconhecidos.join(", ")}. Use só os campos da lista.` };
  }
  if (validacao.chavesSoltas) return { ok: false, mensagem: "Há chaves {{ ou }} sem par no modelo. Confira os campos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("modelos_contrato")
    .upsert({ empresa_id: atual.empresaId, conteudo: conteudo.data, atualizado_por: atual.membroId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o modelo.") };

  revalidatePath("/configuracoes/contrato");
  return { ok: true, mensagem: "Modelo salvo." };
}

/** Gera (ou regera, enquanto ainda for rascunho) o contrato do negócio a partir do modelo da empresa. */
export async function gerarContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "SDR não pode gerar contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const id = z.string().uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return { ok: false, mensagem: "Negócio inválido." };

  const supabase = await criarClienteServidor();
  const resultado = await gerarContratoComCliente(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, negocioId: id.data });
  if (!resultado.ok) return resultado;

  revalidatePath(`/negocios/${id.data}`);
  return { ok: true, mensagem: "Contrato pronto." };
}

const esquemaConfirmarPagamento = z.object({
  negocioId: z.string().uuid(),
  contratoId: z.string().uuid(),
});

/**
 * Confirma o pagamento do contrato (pedido do Evandro, 2026-10-01): só gestor/admin, e
 * nunca quem é o próprio responsável pelo negócio — tudo validado no RPC `security
 * definer` (a RLS de `contratos` sozinha não bastaria, ver migration
 * 20261001250000_gamificacao_pagamento_confirmado.sql).
 */
export async function confirmarPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, CONFIRMAR_PAGAMENTO)) return { ok: false, mensagem: "Só gestor ou admin pode confirmar pagamento." };
  const dados = esquemaConfirmarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_pagamento", { p_contrato_id: dados.data.contratoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível confirmar o pagamento.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Pagamento confirmado." };
}

const esquemaEstornarPagamento = esquemaConfirmarPagamento.extend({
  motivo: z.string().trim().min(1, "Informe o motivo do estorno.").max(1000),
});

export async function estornarConfirmacaoPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, CONFIRMAR_PAGAMENTO)) return { ok: false, mensagem: "Só gestor ou admin pode estornar a confirmação." };
  const dados = esquemaEstornarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("estornar_confirmacao_pagamento", {
    p_contrato_id: dados.data.contratoId,
    p_motivo: dados.data.motivo,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível estornar a confirmação.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Confirmação de pagamento estornada." };
}

export async function atualizarStatusContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "SDR não pode alterar o status do contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const dados = z
    .object({ negocioId: z.string().uuid(), status: z.enum(STATUS_CONTRATO) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const resultado = await atualizarStatusContratoComCliente(supabase, {
    membroId: atual.membroId,
    negocioId: dados.data.negocioId,
    status: dados.data.status,
  });
  if (!resultado.ok) return resultado;

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Status atualizado." };
}
