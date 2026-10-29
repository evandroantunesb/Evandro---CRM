"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/fixacoes";
const nome = z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo");
const DUPLICADA = "Já existe uma opção com esse nome.";

export async function criarFixacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = nome.safeParse(formData.get("nome"));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fixacoes_telhado").insert({ empresa_id: atual.empresaId, nome: dados.data });
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADA : "Não foi possível criar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Opção criada." };
}

export async function editarFixacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = nome.safeParse(formData.get("nome"));
  if (!id.success || !dados.success) return { ok: false, mensagem: dados.error?.issues[0].message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("fixacoes_telhado")
    .update({ nome: dados.data, ativa: formData.get("ativa") === "on" })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADA : "Não foi possível salvar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
