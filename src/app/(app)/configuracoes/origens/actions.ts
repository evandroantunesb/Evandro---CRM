"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/origens";
const esquema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function criarOrigem(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("origens")
    .insert({ empresa_id: atual.empresaId, nome: dados.data.nome, cor: dados.data.cor ?? null });
  if (error) {
    return { ok: false, mensagem: error.code === "23505" ? "Já existe uma origem com esse nome." : "Não foi possível criar." };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Origem criada." };
}

export async function editarOrigem(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("origens")
    .update({ nome: dados.data.nome, cor: dados.data.cor ?? null, ativa: formData.get("ativa") === "on" })
    .eq("id", id.data);
  if (error) {
    return { ok: false, mensagem: error.code === "23505" ? "Já existe uma origem com esse nome." : "Não foi possível salvar." };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
