"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { editarContatoComCliente, salvarDadosClienteComCliente } from "@/lib/negocios-gravacao";
import { FICHA_CONTATO, PROPOSTA_E_CONTRATO } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function editarContato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...FICHA_CONTATO);
  const supabase = await criarClienteServidor();
  const r = await editarContatoComCliente(supabase, formData);
  if (r.ok) revalidatePath(`/contatos/${formData.get("contatoId")}`);
  return r;
}

/** Dados do cliente para o contrato, na ficha do negócio (quem gera contrato: admin, gestor e vendedor). */
export async function salvarDadosClienteContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...PROPOSTA_E_CONTRATO);
  const supabase = await criarClienteServidor();
  const r = await salvarDadosClienteComCliente(supabase, formData);
  if (r.ok) {
    revalidatePath(`/negocios/${formData.get("negocioId")}`);
    revalidatePath(`/contatos/${formData.get("contatoId")}`);
  }
  return r;
}

/** Só admin/gestor podem excluir um contato (RLS também garante isso no banco). */
export async function excluirContato(formData: FormData) {
  await exigirPapel("admin", "gestor");
  const id = z.string().uuid().safeParse(formData.get("contatoId"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("contatos").delete().eq("id", id.data);
  if (error) return;

  revalidatePath("/contatos");
  redirect("/contatos");
}
