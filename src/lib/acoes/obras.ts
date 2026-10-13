"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { FUNCOES_OPERACIONAIS } from "@/lib/obras/gestao";
import { AGUARDANDO_OBRA, SETORES_OBRA, STATUS_POR_SETOR } from "@/lib/obras/rotulos";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Modo Gestão de Obras. Cada ação só valida a forma da entrada e chama a RPC correspondente da
 * migration 20261008100000_obras_escrita_operacao.sql — nenhuma escrita direta em tabela. Quem
 * pode o quê (admin, coordenador do setor, executor participante ativo), obra cancelada/pausada,
 * motivos obrigatórios e auditoria ficam no banco; o erro marcado com `mensagem_usuario` vai
 * para a tela como veio. `exigirPapel(...GERIR_OBRAS)` só corta cedo quem nunca escreve.
 */

const MAX_MOTIVO = 1000;
const uuid = z.string().uuid();
const setor = z.enum(SETORES_OBRA);
const motivo = z.string().trim().max(MAX_MOTIVO, "Motivo muito longo.");

function concluir(obraId: string, mensagem: string): ResultadoAcao {
  revalidatePath(`/obras/${obraId}`);
  revalidatePath("/obras");
  return { ok: true, mensagem };
}

const esquemaStatus = z
  .object({ obraId: uuid, setor, status: z.string().min(1) })
  .refine((d) => STATUS_POR_SETOR[d.setor].includes(d.status), { message: "Status inválido para este setor." });

export async function alterarStatusFluxoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaStatus.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("alterar_status_fluxo_obra", {
    p_obra_id: dados.data.obraId,
    p_setor: dados.data.setor,
    p_status: dados.data.status,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível alterar o status.") };
  return concluir(dados.data.obraId, "Status atualizado.");
}

const esquemaParado = z
  .object({ obraId: uuid, setor, parado: z.enum(["true", "false"]), motivo: motivo.optional() })
  .refine((d) => d.parado === "false" || Boolean(d.motivo), { message: "Informe o motivo da parada." });

export async function marcarParadoFluxoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaParado.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const parado = dados.data.parado === "true";

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("marcar_parado_fluxo_obra", {
    p_obra_id: dados.data.obraId,
    p_setor: dados.data.setor,
    p_parado: parado,
    ...(parado ? { p_motivo: dados.data.motivo } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar a parada.") };
  return concluir(dados.data.obraId, parado ? "Setor marcado como parado." : "Setor retomado.");
}

const esquemaAguardando = z.object({
  obraId: uuid,
  setor,
  // Vazio = ninguém (limpa).
  aguardando: z.union([z.literal(""), z.enum(AGUARDANDO_OBRA)]),
});

export async function definirAguardandoFluxoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaAguardando.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_aguardando_fluxo_obra", {
    p_obra_id: dados.data.obraId,
    p_setor: dados.data.setor,
    // Sem o parâmetro, a RPC usa o padrão nulo: limpa a pendência.
    ...(dados.data.aguardando ? { p_aguardando: dados.data.aguardando } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar a pendência.") };
  return concluir(dados.data.obraId, dados.data.aguardando ? "Pendência registrada." : "Pendência removida.");
}

const esquemaMarco = z
  .object({
    obraId: uuid,
    marco: z.enum(["nf_cliente", "garantia"]),
    status: z.enum(["pendente", "concluido", "nao_se_aplica"]),
    motivo: motivo.optional(),
  })
  .refine((d) => d.status !== "nao_se_aplica" || Boolean(d.motivo), { message: "Informe por que o marco não se aplica." });

export async function atualizarMarcoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaMarco.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("atualizar_marco_obra", {
    p_obra_id: dados.data.obraId,
    p_marco: dados.data.marco,
    p_status: dados.data.status,
    ...(dados.data.status === "nao_se_aplica" ? { p_motivo: dados.data.motivo } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o marco.") };
  return concluir(dados.data.obraId, "Marco atualizado.");
}

const esquemaAtribuir = z
  .object({
    obraId: uuid,
    setor,
    membroId: uuid,
    funcao: z.enum(FUNCOES_OPERACIONAIS),
    principal: z.enum(["true", "false"]).default("false"),
    substituiId: z.union([z.literal(""), uuid]).default(""),
  })
  .refine((d) => d.principal === "false" || d.funcao === "responsavel", {
    message: "O responsável principal precisa ter a função Responsável.",
  });

export async function atribuirParticipanteObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaAtribuir.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("atribuir_participante_obra", {
    p_obra_id: dados.data.obraId,
    p_membro_id: dados.data.membroId,
    p_setor: dados.data.setor,
    p_funcao: dados.data.funcao,
    p_principal: dados.data.principal === "true",
    ...(dados.data.substituiId ? { p_substitui_id: dados.data.substituiId } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atribuir o participante.") };
  return concluir(dados.data.obraId, dados.data.substituiId ? "Participante substituído." : "Participante atribuído.");
}

const esquemaEncerrar = z.object({
  obraId: uuid,
  participanteId: uuid,
  motivo: motivo.min(1, "Informe o motivo do encerramento."),
});

export async function encerrarParticipanteObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaEncerrar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("encerrar_participante_obra", {
    p_participante_id: dados.data.participanteId,
    p_motivo: dados.data.motivo,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível encerrar a participação.") };
  return concluir(dados.data.obraId, "Participação encerrada.");
}
