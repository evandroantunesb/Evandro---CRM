"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const opcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const esquema = z.object({
  contatoId: z.string().uuid(),
  tipo: z.enum(["pf", "pj"]),
  nome: z.string().trim().min(2, "Informe o nome"),
  telefone: opcional,
  telefone2: opcional,
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).transform((v) => v || null),
  documento: opcional,
  cidade: opcional,
  uf: opcional.transform((v) => (v ? v.toUpperCase().slice(0, 2) : null)),
});

export async function editarContato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const { contatoId, ...campos } = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("contatos").update(campos).eq("id", contatoId).select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível salvar o contato." };

  revalidatePath(`/contatos/${contatoId}`);
  return { ok: true, mensagem: "Contato salvo." };
}
