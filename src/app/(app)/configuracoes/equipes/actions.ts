"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/equipes";

export async function criarEquipe(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const nome = z.string().trim().min(2).safeParse(formData.get("nome"));
  if (!nome.success) return { ok: false, mensagem: "Informe o nome da equipe." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("equipes").insert({ empresa_id: atual.empresaId, nome: nome.data });
  if (error) {
    return {
      ok: false,
      mensagem: error.code === "23505" ? "Já existe uma equipe com esse nome." : "Não foi possível criar a equipe.",
    };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Equipe criada." };
}

export async function adicionarNaEquipe(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({ equipeId: z.string().uuid(), membroId: z.string().uuid(), e_gestor: z.enum(["on"]).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Escolha uma pessoa." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("equipe_membros").insert({
    empresa_id: atual.empresaId,
    equipe_id: dados.data.equipeId,
    membro_id: dados.data.membroId,
    e_gestor: dados.data.e_gestor === "on",
  });
  if (error) {
    return {
      ok: false,
      mensagem: error.code === "23505" ? "Essa pessoa já está na equipe." : "Não foi possível adicionar.",
    };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Adicionado." };
}

export async function removerDaEquipe(formData: FormData) {
  const { atual } = await exigirPapel("admin");
  const equipeId = String(formData.get("equipeId"));
  const membroId = String(formData.get("membroId"));
  const supabase = await criarClienteServidor();
  await supabase
    .from("equipe_membros")
    .delete()
    .eq("empresa_id", atual.empresaId)
    .eq("equipe_id", equipeId)
    .eq("membro_id", membroId);
  revalidatePath(CAMINHO);
}

export async function alternarGestor(formData: FormData) {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  await supabase
    .from("equipe_membros")
    .update({ e_gestor: formData.get("e_gestor") === "true" })
    .eq("empresa_id", atual.empresaId)
    .eq("equipe_id", String(formData.get("equipeId")))
    .eq("membro_id", String(formData.get("membroId")));
  revalidatePath(CAMINHO);
}

export async function alternarEquipeAtiva(formData: FormData) {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  await supabase
    .from("equipes")
    .update({ ativa: formData.get("ativa") === "true" })
    .eq("empresa_id", atual.empresaId)
    .eq("id", String(formData.get("equipeId")));
  revalidatePath(CAMINHO);
}
