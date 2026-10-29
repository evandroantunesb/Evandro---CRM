"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { TAREFAS_SETOR } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BUCKET_ANEXOS_TAREFA, SETORES_TAREFA } from "@/lib/tarefas-setor-regras";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Ações das tarefas de setor. Cada uma chama a RPC correspondente, que confere de novo quem pode (o servidor não
 * decide nada sozinho) e grava o histórico com o autor real.
 */

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.string().uuid().optional());

const vinculo = z.object({ obraId: uuidOpcional, negocioId: uuidOpcional });

function revalidar({ obraId, negocioId }: z.infer<typeof vinculo>) {
  revalidatePath("/tarefas/setores");
  revalidatePath("/inicio");
  if (obraId) revalidatePath(`/obras/${obraId}`);
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
}

const esquemaCriar = vinculo.extend({
  setor: z.enum(SETORES_TAREFA, { error: "Escolha o setor." }),
  titulo: z.string().trim().min(2, "Informe o título da tarefa.").max(160, "Título muito longo."),
  descricao: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o prazo."),
});

/** Resultado da criação: a pasta da tarefa no Storage, para o navegador enviar os anexos escolhidos. */
export type ResultadoCriarTarefa = { ok: boolean; mensagem: string; pastaAnexos?: string } | null;

export async function criarTarefaSetor(_: ResultadoCriarTarefa, formData: FormData): Promise<ResultadoCriarTarefa> {
  const { atual } = await exigirPapel(...TAREFAS_SETOR);
  const dados = esquemaCriar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  if (!d.obraId === !d.negocioId) return { ok: false, mensagem: "Tarefa sem obra ou negócio." };
  const supabase = await criarClienteServidor();
  const { data: tarefaId, error } = await supabase.rpc("criar_tarefa_setor", {
    p_setor: d.setor,
    p_titulo: d.titulo,
    p_prazo: d.prazo,
    ...(d.obraId ? { p_obra_id: d.obraId } : { p_negocio_id: d.negocioId }),
    ...(d.descricao ? { p_descricao: d.descricao } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a tarefa.") };
  revalidar(d);
  return { ok: true, mensagem: "Tarefa enviada ao setor.", pastaAnexos: `${atual.empresaId}/${tarefaId}` };
}

/**
 * Registra um arquivo que o navegador já enviou à pasta da tarefa. A RPC confere tudo de novo: a tarefa aberta e
 * visível, o objeto no Storage enviado por quem chama; tamanho e tipo vêm do Storage.
 */
export async function registrarAnexoTarefaSetor(dados: {
  caminho: string;
  nome: string;
  obraId?: string | null;
  negocioId?: string | null;
}): Promise<ResultadoAcao> {
  await exigirPapel(...TAREFAS_SETOR);
  const d = vinculo
    .extend({ caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) })
    .safeParse({ ...dados, obraId: dados.obraId ?? undefined, negocioId: dados.negocioId ?? undefined });
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_anexo_tarefa_setor", { p_caminho: d.data.caminho, p_nome: d.data.nome });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o arquivo.") };
  revalidar(d.data);
  return { ok: true, mensagem: "Arquivo anexado." };
}

/** Remove um anexo: o banco decide (quem enviou ou o admin, tarefa aberta); só então o arquivo sai do Storage. */
export async function removerAnexoTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...TAREFAS_SETOR);
  const d = vinculo.extend({ anexoId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Arquivo inválido." };
  const supabase = await criarClienteServidor();
  const { data: caminho, error } = await supabase.rpc("remover_anexo_tarefa_setor", { p_anexo_id: d.data.anexoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível remover o arquivo.") };
  if (caminho) await criarClienteAdmin().storage.from(BUCKET_ANEXOS_TAREFA).remove([caminho]);
  revalidar(d.data);
  return { ok: true, mensagem: "Arquivo removido." };
}

const esquemaTarefa = vinculo.extend({ tarefaId: z.string().uuid() });

/** Executa uma RPC da tarefa e revalida as telas que a mostram. */
async function naTarefa(
  formData: FormData,
  extra: z.ZodRawShape,
  chamar: (supabase: Awaited<ReturnType<typeof criarClienteServidor>>, d: Record<string, unknown> & { tarefaId: string }) => PromiseLike<{
    error: { message: string; hint?: string | null } | null;
  }>,
  sucesso: string,
  falha: string,
): Promise<NonNullable<ResultadoAcao>> {
  await exigirPapel(...TAREFAS_SETOR);
  const dados = esquemaTarefa.extend(extra).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await chamar(supabase, dados.data as Record<string, unknown> & { tarefaId: string });
  if (error) return { ok: false, mensagem: mensagemErro(error, falha) };
  revalidar(dados.data as z.infer<typeof vinculo>);
  return { ok: true, mensagem: sucesso };
}

export async function assumirTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  return naTarefa(formData, {}, (s, d) => s.rpc("assumir_tarefa_setor", { p_tarefa_id: d.tarefaId }), "Tarefa com você.", "Não foi possível assumir.");
}

export async function atribuirTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  return naTarefa(
    formData,
    { membroId: uuidOpcional },
    (s, d) => s.rpc("atribuir_tarefa_setor", { p_tarefa_id: d.tarefaId, ...(d.membroId ? { p_membro_id: d.membroId as string } : {}) }),
    "Responsável atualizado.",
    "Não foi possível atribuir.",
  );
}

export async function concluirTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  return naTarefa(
    formData,
    { resposta: z.string().trim().max(2000, "Resposta muito longa.").optional() },
    (s, d) => s.rpc("concluir_tarefa_setor", { p_tarefa_id: d.tarefaId, ...(d.resposta ? { p_resposta: d.resposta as string } : {}) }),
    "Tarefa concluída.",
    "Não foi possível concluir.",
  );
}

export async function reabrirTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  return naTarefa(formData, {}, (s, d) => s.rpc("reabrir_tarefa_setor", { p_tarefa_id: d.tarefaId }), "Tarefa reaberta.", "Não foi possível reabrir.");
}

export async function cancelarTarefaSetor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  return naTarefa(
    formData,
    { motivo: z.string().trim().min(1, "Informe o motivo do cancelamento.").max(500, "Motivo muito longo.") },
    (s, d) => s.rpc("cancelar_tarefa_setor", { p_tarefa_id: d.tarefaId, p_motivo: d.motivo as string }),
    "Tarefa cancelada.",
    "Não foi possível cancelar.",
  );
}
