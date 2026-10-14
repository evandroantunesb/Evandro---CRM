"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { NEGOCIOS, PAGAMENTO_SOLO, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Registro manual de pagamento do Raion Solo (PR #186 / issue #187). Toda a autorização está nas
 * RPCs `security definer` (admin único do Solo para registrar; admin da empresa para estornar e
 * corrigir um registro de origem Solo, inclusive depois do upgrade). A checagem de papel aqui só
 * evita uma ida ao banco e dá uma mensagem melhor — nunca é a barreira.
 */

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal("").transform(() => undefined));
const observacao = z.string().trim().max(500, "Observação muito longa (máximo 500 caracteres).").optional();
const motivo = z.string().trim().min(1, "Informe o motivo.").max(1000, "Motivo muito longo.");

const esquemaRegistrar = z.object({ negocioId: z.string().uuid(), dataRecebimento: data, observacao });
const esquemaEstornar = z.object({ negocioId: z.string().uuid(), motivo });
const esquemaCorrigir = esquemaRegistrar.extend({ motivo });

/** Lista positiva (`PAGAMENTO_SOLO`): papel fora dela recebe a mensagem, nunca acesso por exclusão. */
async function negarForaDaLista(mensagem: string): Promise<ResultadoAcao | null> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PAGAMENTO_SOLO)) return { ok: false, mensagem };
  return null;
}

export async function registrarPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const negado = await negarForaDaLista("Só o administrador registra pagamento.");
  if (negado) return negado;
  const dados = esquemaRegistrar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_pagamento_negocio", {
    p_negocio_id: dados.data.negocioId,
    p_data_recebimento: dados.data.dataRecebimento,
    p_observacao: dados.data.observacao || undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o pagamento.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Pagamento registrado." };
}

export async function estornarRegistroPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const negado = await negarForaDaLista("Só o administrador estorna o registro de pagamento.");
  if (negado) return negado;
  const dados = esquemaEstornar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("estornar_registro_pagamento", { p_negocio_id: dados.data.negocioId, p_motivo: dados.data.motivo });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível estornar o registro.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Registro de pagamento estornado." };
}

export async function corrigirRegistroPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const negado = await negarForaDaLista("Só o administrador corrige o registro de pagamento.");
  if (negado) return negado;
  const dados = esquemaCorrigir.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  if (!dados.data.dataRecebimento) return { ok: false, mensagem: "Informe a data do recebimento." };

  const supabase = await criarClienteServidor();
  // Estorno do registro anterior + registro corrigido numa única transação, no banco.
  const { error } = await supabase.rpc("corrigir_registro_pagamento", {
    p_negocio_id: dados.data.negocioId,
    p_data_recebimento: dados.data.dataRecebimento,
    p_observacao: dados.data.observacao ?? "",
    p_motivo: dados.data.motivo,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível corrigir o registro.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Registro de pagamento corrigido." };
}
