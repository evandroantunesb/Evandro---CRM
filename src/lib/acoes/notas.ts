"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function criarNota(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = z
    .object({
      negocioId: z.string().uuid(),
      texto: z.string().trim().min(1, "Escreva a nota").max(5000, "Nota muito longa (máximo 5.000 caracteres)"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("notas")
    .insert({ empresa_id: atual.empresaId, negocio_id: dados.data.negocioId, texto: dados.data.texto });
  if (error) return { ok: false, mensagem: "Não foi possível salvar a nota." };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Nota salva." };
}

export async function apagarNota(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("notaId"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("notas").delete().eq("id", id.data).select("negocio_id");
  if (data?.[0]) revalidatePath(`/negocios/${data[0].negocio_id}`);
}
