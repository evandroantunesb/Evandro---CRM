"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/calculadora";

/** Ativa um módulo ou inversor do catálogo (OpenSolar) como opção do dimensionamento automático. */
export async function ativarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      tipo: z.enum(["modulo", "inversor"]),
      opensolarId: z.coerce.number().int().optional(),
      fabricante: z.string().trim().min(1, "Informe o fabricante").max(120),
      modelo: z.string().trim().min(1, "Informe o modelo").max(120),
      potenciaW: z.coerce.number().positive("Informe a potência"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("equipamentos_empresa").insert({
    empresa_id: atual.empresaId,
    tipo: d.tipo,
    opensolar_id: d.opensolarId ?? null,
    fabricante: d.fabricante,
    modelo: d.modelo,
    potencia_w: d.potenciaW,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível ativar o equipamento.") };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Equipamento ativado." };
}

/** Liga/desliga um equipamento já ativado, ou ajusta a prioridade comercial dele no ranking automático. */
export async function editarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z
    .object({
      id: z.string().uuid(),
      prioridade: z.coerce.number().int().min(-100).max(100),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("equipamentos_empresa")
    .update({ prioridade: dados.data.prioridade, ativo: formData.get("ativo") === "on" })
    .eq("id", dados.data.id);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarEquipamento(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  await supabase.from("equipamentos_empresa").delete().eq("id", id.data);
  revalidatePath(CAMINHO);
}
