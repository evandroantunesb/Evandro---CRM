"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prazoParaIso } from "@/lib/crm";
import { mensagemErro } from "@/lib/erros";
import { apagarEvento, criarEvento, obterAccessToken } from "@/lib/google-agenda";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_TAREFA, type ResultadoAcao } from "@/lib/tipos";

const DURACAO_EVENTO_MINUTOS = 30;

/** Cria o evento na Agenda do responsável, se ele tiver a conta conectada. Nunca falha a criação da tarefa. */
async function sincronizarCriacao(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  tarefaId: string,
  responsavelId: string | null,
  titulo: string,
  venceEmIso: string,
) {
  if (!responsavelId) return;
  try {
    const admin = criarClienteAdmin();
    const { data: conexao } = await admin
      .from("google_agenda_conexoes")
      .select("refresh_token")
      .eq("membro_id", responsavelId)
      .maybeSingle();
    if (!conexao) return;

    const accessToken = await obterAccessToken(conexao.refresh_token);
    if (!accessToken) return;

    const inicio = new Date(venceEmIso);
    const fim = new Date(inicio.getTime() + DURACAO_EVENTO_MINUTOS * 60 * 1000);
    const eventoId = await criarEvento(accessToken, {
      titulo,
      inicioIso: inicio.toISOString(),
      fimIso: fim.toISOString(),
    });
    if (eventoId) await supabase.from("tarefas").update({ google_evento_id: eventoId }).eq("id", tarefaId);
  } catch {
    // Falha na integração nunca deve impedir a criação da tarefa.
  }
}

/** Apaga o evento correspondente na Agenda do responsável, se houver. Best-effort. */
async function sincronizarExclusao(responsavelId: string | null, eventoId: string | null) {
  if (!responsavelId || !eventoId) return;
  try {
    const admin = criarClienteAdmin();
    const { data: conexao } = await admin
      .from("google_agenda_conexoes")
      .select("refresh_token")
      .eq("membro_id", responsavelId)
      .maybeSingle();
    if (!conexao) return;
    const accessToken = await obterAccessToken(conexao.refresh_token);
    if (!accessToken) return;
    await apagarEvento(accessToken, eventoId);
  } catch {
    // Best-effort.
  }
}

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
  const venceEmIso = prazoParaIso(d.vence_em);
  // Vendedor sempre cria para si; o banco confere quem pode atribuir para quem.
  const responsavelId = atual.papel === "vendedor" ? atual.membroId : (d.responsavel_id ?? atual.membroId);
  const { data: tarefa, error } = await supabase
    .from("tarefas")
    .insert({
      empresa_id: atual.empresaId,
      negocio_id: d.negocioId,
      titulo: d.titulo,
      tipo: d.tipo,
      vence_em: venceEmIso,
      responsavel_id: responsavelId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a tarefa.") };

  await sincronizarCriacao(supabase, tarefa.id, responsavelId, d.titulo, venceEmIso);
  if (responsavelId && responsavelId !== atual.membroId) {
    const admin = criarClienteAdmin();
    await admin.from("notificacoes").insert({
      empresa_id: atual.empresaId,
      membro_id: responsavelId,
      tipo: "tarefa_atribuida",
      mensagem: `Nova tarefa atribuída: "${d.titulo}"`,
      link: "/tarefas",
    });
  }

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
  const { data } = await supabase
    .from("tarefas")
    .delete()
    .eq("id", id.data)
    .select("negocio_id, responsavel_id, google_evento_id");
  const tarefa = data?.[0];
  atualizarTelas(tarefa?.negocio_id ?? null);
  await sincronizarExclusao(tarefa?.responsavel_id ?? null, tarefa?.google_evento_id ?? null);
}
