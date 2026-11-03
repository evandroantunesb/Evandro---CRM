"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { MENSAGEM_NUMERO_BR, lerNumeroBr } from "@/lib/formatacao";
import { ETAPAS_OBRA } from "@/lib/obras/cronograma";
import { ESCALONAMENTO_OBRA, OBRAS, OPR_COMPLETA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Obras OPR: justificativa de atraso e escalonamentos. Cada ação só valida a forma da entrada e chama a RPC da
 * migration 20261106100000_obras_opr_completa.sql; quem pode o quê fica no banco, e o erro marcado com
 * `mensagem_usuario` vai para a tela como veio.
 */

const uuid = z.string().uuid();

function concluir(obraId: string, mensagem: string): ResultadoAcao {
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/apresentacao/${obraId}`);
  revalidatePath("/obras");
  return { ok: true, mensagem };
}

const etapaObra = z.enum(ETAPAS_OBRA);

/** Admin ou gestor pede a justificativa de uma etapa com atraso próprio; já pendente, cobra (renova o prazo). */
export async function pedirJustificativaAtraso(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...OPR_COMPLETA);
  const dados = z.object({ obraId: uuid, etapa: etapaObra }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("pedir_justificativa_atraso", { p_obra_id: dados.data.obraId, p_etapa: dados.data.etapa });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível pedir a justificativa.") };
  return concluir(dados.data.obraId, formData.get("cobrar") ? "Justificativa cobrada: o prazo foi renovado." : "Justificativa pedida.");
}

const esquemaResposta = z.object({
  obraId: uuid,
  justificativaId: uuid,
  texto: z.string().trim().min(3, "Explique o atraso.").max(500, "Justificativa muito longa."),
});

/** Quem recebeu o pedido (ou o admin, ou quem coordena o setor) responde a justificativa. */
export async function responderJustificativaAtraso(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...OBRAS);
  const dados = esquemaResposta.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_justificativa_atraso", { p_justificativa_id: dados.data.justificativaId, p_texto: dados.data.texto });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível responder.") };
  return concluir(dados.data.obraId, "Justificativa registrada.");
}

const esquemaEscalonamento = z.object({
  obraId: uuid,
  titulo: z.string().trim().min(3, "Descreva o que precisa de decisão.").max(200, "Texto muito longo."),
  valor: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : lerNumeroBr(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), `Valor inválido. ${MENSAGEM_NUMERO_BR}`),
});

/** Gestor, admin ou o Operacional da obra abre um escalonamento (título e, se quiser, o valor fora do programado). */
export async function abrirEscalonamentoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ESCALONAMENTO_OBRA);
  const dados = esquemaEscalonamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("abrir_escalonamento_obra", {
    p_obra_id: dados.data.obraId,
    p_titulo: dados.data.titulo,
    p_valor: dados.data.valor ?? undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível abrir o escalonamento.") };
  return concluir(dados.data.obraId, "Escalonamento aberto.");
}

const esquemaFechamento = z.object({
  obraId: uuid,
  escalonamentoId: uuid,
  resolucao: z.string().trim().min(3, "Registre a decisão tomada.").max(500, "Texto muito longo."),
});

export async function fecharEscalonamentoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ESCALONAMENTO_OBRA);
  const dados = esquemaFechamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fechar_escalonamento_obra", { p_escalonamento_id: dados.data.escalonamentoId, p_resolucao: dados.data.resolucao });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível fechar o escalonamento.") };
  return concluir(dados.data.obraId, "Escalonamento fechado.");
}
