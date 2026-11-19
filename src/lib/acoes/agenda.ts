"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Agenda operacional (20261217100000_agenda_operacional.sql). As ações só validam a forma e chamam o banco: quem pode
 * agendar, status do Operacional, motivo do reagendamento, Solo e histórico ficam em `agendar_instalacao_obra`; quem
 * cadastra equipe, na RLS de `equipes_instalacao`.
 */

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const textoOpcional = (max: number, msg: string) => z.string().trim().max(max, msg).optional().transform((v) => (v ? v : null));

const esquemaAgendar = z.object({
  obraId: z.string().uuid(),
  equipeId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  equipeNome: textoOpcional(80, "Nome da equipe muito longo."),
  equipeTelefone: textoOpcional(30, "Telefone muito longo."),
  inicio: data,
  termino: data,
  observacao: textoOpcional(500, "A observação passou de 500 caracteres."),
  motivo: textoOpcional(300, "Motivo muito longo."),
});

export async function agendarInstalacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaAgendar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const d = dados.data;
  if (!d.equipeId && !d.equipeNome) return { ok: false, mensagem: "Escolha a equipe ou digite o nome dela." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("agendar_instalacao_obra", {
    p_obra_id: d.obraId,
    p_equipe_id: d.equipeId as string,
    p_equipe_nome: (d.equipeId ? null : d.equipeNome) as string,
    p_equipe_telefone: (d.equipeId ? null : d.equipeTelefone) as string,
    p_inicio: d.inicio,
    p_termino: d.termino,
    p_observacao: d.observacao as string,
    p_motivo: d.motivo as string,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível agendar a instalação.") };
  revalidatePath(`/obras/${d.obraId}`);
  revalidatePath("/obras/agenda");
  return { ok: true, mensagem: "Instalação agendada." };
}

/** Término sugerido (3 dias úteis contando o início), pelo calendário da empresa. */
export async function sugerirTerminoInstalacao(inicio: string): Promise<string | null> {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  if (!data.safeParse(inicio).success) return null;
  const supabase = await criarClienteServidor();
  const { data: termino } = await supabase.rpc("sugerir_termino_instalacao", { p_empresa_id: atual.empresaId, p_inicio: inicio });
  return termino ?? null;
}

const esquemaEquipe = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  nome: z.string().trim().min(2, "Informe o nome da equipe.").max(80, "Nome muito longo."),
  telefone: textoOpcional(30, "Telefone muito longo."),
  // Caixa "Ativa" da edição: marcada envia "true"; desmarcada não envia.
  ativa: z.literal("true").optional(),
});

export async function salvarEquipeInstalacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const dados = esquemaEquipe.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { id, nome, telefone, ativa } = dados.data;
  const supabase = await criarClienteServidor();
  const resposta = id
    ? await supabase
        .from("equipes_instalacao")
        .update({ nome, telefone, ativa: ativa === "true" })
        .eq("id", id)
        .eq("empresa_id", atual.empresaId)
        .select("id")
    : await supabase.from("equipes_instalacao").insert({ empresa_id: atual.empresaId, nome, telefone }).select("id");
  if (resposta.error) {
    if (resposta.error.code === "23505") return { ok: false, mensagem: "Já existe uma equipe com esse nome." };
    return { ok: false, mensagem: mensagemErro(resposta.error, "Não foi possível salvar a equipe.") };
  }
  if (!resposta.data?.length) return { ok: false, mensagem: "Sem permissão para cadastrar equipes de instalação." };
  revalidatePath("/obras/agenda/equipes");
  return { ok: true, mensagem: id ? "Equipe atualizada." : "Equipe cadastrada." };
}
