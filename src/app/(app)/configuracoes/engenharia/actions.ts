"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/engenharia";
const DUPLICADO = "Já existe um item com esse título.";

const esquema = z.object({
  grupo: z.string().trim().min(2, "Grupo muito curto").max(60, "Grupo muito longo"),
  titulo: z.string().trim().min(2, "Título muito curto").max(160, "Título muito longo"),
  ordem: z.coerce.number().int("Ordem inválida").min(0).max(9999),
});

const ler = (formData: FormData) =>
  esquema.safeParse({ grupo: formData.get("grupo"), titulo: formData.get("titulo"), ordem: formData.get("ordem") || 0 });

export async function criarItemModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = ler(formData);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("engenharia_checklist_modelo")
    .insert({ empresa_id: atual.empresaId, ...d.data, obrigatorio: formData.get("obrigatorio") === "on" });
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADO : "Não foi possível criar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Item criado." };
}

export async function editarItemModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const d = ler(formData);
  if (!id.success || !d.success) return { ok: false, mensagem: d.error?.issues[0].message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("engenharia_checklist_modelo")
    .update({ ...d.data, obrigatorio: formData.get("obrigatorio") === "on", ativo: formData.get("ativo") === "on" })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADO : "Não foi possível salvar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
