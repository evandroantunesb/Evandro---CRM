"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { PROPOSTA_E_CONTRATO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const percentual = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(",", ".")))
  .refine((v) => Number.isFinite(v) && v > 0 && v <= 100, "Informe um desconto entre 0 e 100%.");

const esquemaPedido = z.object({
  negocioId: z.string().uuid(),
  percentual,
  motivo: z.string().trim().min(3, "Explique o motivo do desconto.").max(500, "Motivo longo demais."),
});

/** Pede aprovação de desconto à vista acima do próprio limite (o banco confere limite, papel e quem é avisado). */
export async function solicitarDesconto(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...PROPOSTA_E_CONTRATO);
  const d = esquemaPedido.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("solicitar_desconto", { p_negocio_id: d.data.negocioId, p_percentual: d.data.percentual, p_motivo: d.data.motivo });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível pedir o desconto.") };

  revalidatePath(`/negocios/${d.data.negocioId}`);
  return { ok: true, mensagem: "Pedido enviado. Quem pode aprovar já foi avisado." };
}

const esquemaDecisao = z.object({
  negocioId: z.string().uuid(),
  pedidoId: z.string().uuid(),
  decisao: z.enum(["aprovar", "recusar"]),
  motivo: z.string().trim().max(500, "Motivo longo demais.").optional(),
});

/** Aprova ou recusa um pedido de desconto (admin, ou gestor da equipe até o próprio limite; recusa exige motivo). */
export async function decidirDesconto(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin", "gestor");
  const d = esquemaDecisao.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const aprovar = d.data.decisao === "aprovar";
  const { error } = await supabase.rpc("decidir_desconto", { p_id: d.data.pedidoId, p_aprovar: aprovar, p_motivo: d.data.motivo ?? "" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar a decisão.") };

  revalidatePath(`/negocios/${d.data.negocioId}`);
  return { ok: true, mensagem: aprovar ? "Desconto aprovado." : "Desconto recusado." };
}
