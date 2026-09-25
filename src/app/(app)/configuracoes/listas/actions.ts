"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/listas";
const nome = z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo");
const cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

function erroDuplicado(code: string | undefined, padrao: string): ResultadoAcao {
  return { ok: false, mensagem: code === "23505" ? "Já existe um item com esse nome." : padrao };
}

export async function criarEtiqueta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z.object({ nome, cor }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("etiquetas")
    .insert({ empresa_id: atual.empresaId, nome: dados.data.nome, cor: dados.data.cor ?? null });
  if (error) return erroDuplicado(error.code, "Não foi possível criar.");
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Etiqueta criada." };
}

export async function editarEtiqueta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z.object({ id: z.string().uuid(), nome, cor }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("etiquetas")
    .update({ nome: dados.data.nome, cor: dados.data.cor ?? null, ativa: formData.get("ativo") === "on" })
    .eq("id", dados.data.id);
  if (error) return erroDuplicado(error.code, "Não foi possível salvar.");
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

export async function criarMotivo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z.object({ nome }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("motivos_perda").insert({ empresa_id: atual.empresaId, nome: dados.data.nome });
  if (error) return erroDuplicado(error.code, "Não foi possível criar.");
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Motivo criado." };
}

export async function editarMotivo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z.object({ id: z.string().uuid(), nome }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("motivos_perda")
    .update({ nome: dados.data.nome, ativo: formData.get("ativo") === "on" })
    .eq("id", dados.data.id);
  if (error) return erroDuplicado(error.code, "Não foi possível salvar.");
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
