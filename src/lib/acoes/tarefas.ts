"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prazoParaIso } from "@/lib/crm";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_TAREFA, type ResultadoAcao } from "@/lib/tipos";

const esquemaTarefa = z.object({
  negocioId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
  titulo: z.string().trim().min(2, "Descreva a tarefa").max(200, "Descrição muito longa"),
  tipo: z.enum(TIPOS_TAREFA),
  vence_em: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora"),
  responsavel_id: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
});

function atualizarTelas(negocioId: string | null) {
  revalidatePath("/tarefas");
  revalidatePath("/inicio");
  revalidatePath("/negocios");
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
}

export async function criarTarefa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaTarefa.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("tarefas").insert({
    empresa_id: atual.empresaId,
    negocio_id: d.negocioId,
    titulo: d.titulo,
    tipo: d.tipo,
    vence_em: prazoParaIso(d.vence_em),
    // Vendedor sempre cria para si; o banco confere quem pode atribuir para quem.
    responsavel_id: atual.papel === "vendedor" ? atual.membroId : (d.responsavel_id ?? atual.membroId),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a tarefa.") };

  atualizarTelas(d.negocioId);
  return { ok: true, mensagem: "Tarefa criada." };
}

/** Marca como concluída ou volta para pendente. */
export async function alternarConclusao(formData: FormData) {
  await exigirPapel();
  const d = z
    .object({ tarefaId: z.string().uuid(), concluir: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!d.success) return;

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("tarefas")
    .update({ concluida_em: d.data.concluir === "true" ? new Date().toISOString() : null })
    .eq("id", d.data.tarefaId)
    .select("negocio_id");
  atualizarTelas(data?.[0]?.negocio_id ?? null);
}

export async function apagarTarefa(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("tarefaId"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("tarefas").delete().eq("id", id.data).select("negocio_id");
  atualizarTelas(data?.[0]?.negocio_id ?? null);
}
