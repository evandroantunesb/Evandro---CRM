"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/captura";

const esquema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  funil_id: z.string().uuid("Escolha um funil"),
  origem_id: z.string().uuid("Escolha uma origem"),
});

export async function criarFormulario(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("formularios").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    funil_id: dados.data.funil_id,
    origem_id: dados.data.origem_id,
  });
  if (error) return { ok: false, mensagem: "Não foi possível criar o formulário." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Formulário criado." };
}

export async function alternarFormulario(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("formularios")
    .update({ ativo: formData.get("ativo") === "on" })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
