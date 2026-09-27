"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularValoresPlano, type PlanoEmpresa } from "@/lib/cobranca";
import { exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/super-admin/cobranca";

/** Fecha o mês de uma empresa: guarda uma foto dos valores de agora (usuários
 * ativos x plano vigente). Não sobrescreve um mês já fechado — o histórico
 * não muda mesmo que o plano seja editado depois. */
export async function fecharMes(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSuperAdmin();
  const dados = z
    .object({ empresaId: z.string().uuid(), referencia: z.string().regex(/^\d{4}-\d{2}-01$/) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const [{ data: plano }, { count: usuariosAtivos }] = await Promise.all([
    supabase
      .from("planos_empresa")
      .select("tipo, modelo_cobranca, valor_fixo, valor_por_usuario, dia_vencimento, limite_usuarios")
      .eq("empresa_id", dados.data.empresaId)
      .maybeSingle(),
    supabase
      .from("empresa_membros")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", dados.data.empresaId)
      .eq("ativo", true),
  ]);

  const valores = calcularValoresPlano(plano as PlanoEmpresa | null, usuariosAtivos ?? 0);
  const { error } = await supabase.from("fechamentos_mensais").insert({
    empresa_id: dados.data.empresaId,
    referencia: dados.data.referencia,
    usuarios_ativos: usuariosAtivos ?? 0,
    valor_fixo: valores.valorFixo,
    valor_por_usuario: valores.valorPorUsuario,
    valor_total: valores.valorTotal,
    registrado_por: sessao.userId,
  });
  if (error) {
    return {
      ok: error.code === "23505",
      mensagem: error.code === "23505" ? "Esse mês já estava fechado." : "Não foi possível fechar o mês.",
    };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Mês fechado." };
}

export async function marcarPago(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirSuperAdmin();
  const dados = z.object({ fechamentoId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("fechamentos_mensais")
    .update({ pago: true, pago_em: new Date().toISOString() })
    .eq("id", dados.data.fechamentoId);
  if (error) return { ok: false, mensagem: "Não foi possível marcar como pago." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Marcado como pago." };
}
