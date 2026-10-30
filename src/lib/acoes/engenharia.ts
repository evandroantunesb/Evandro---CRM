"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { ENGENHARIA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Ações do checklist da Engenharia. Cada uma chama a RPC, que confere de novo quem pode (admin, coordenador da
 * Engenharia ou participante ativo dela), trava a obra e grava o histórico com o autor real.
 */

function revalidar(obraId: string) {
  revalidatePath("/engenharia");
  revalidatePath(`/engenharia/${obraId}`);
  revalidatePath(`/obras/${obraId}`);
}

const comObra = z.object({ obraId: z.string().uuid() });

/** Copia para a obra os itens ativos do modelo que ela ainda não tem. */
export async function aplicarChecklistEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Obra inválida." };
  const supabase = await criarClienteServidor();
  const { data: novos, error } = await supabase.rpc("aplicar_checklist_engenharia", { p_obra_id: d.data.obraId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível aplicar o checklist.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: novos ? `${novos} ${novos === 1 ? "item entrou" : "itens entraram"} no checklist.` : "O checklist já está atualizado." };
}

/**
 * Registra um arquivo que o navegador já enviou à pasta da obra, como nova versão do item. A RPC confere a pasta, o
 * objeto (enviado por quem chama) e a autorização; tamanho e tipo vêm do Storage.
 */
export async function registrarDocumentoEngenharia(dados: { obraId: string; itemId: string; caminho: string; nome: string }): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra
    .extend({ itemId: z.string().uuid(), caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) })
    .safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_documento_engenharia", { p_item_id: d.data.itemId, p_caminho: d.data.caminho, p_nome: d.data.nome });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o arquivo.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Arquivo anexado." };
}

const esquemaAlterar = comObra.extend({
  itemId: z.string().uuid(),
  status: z.enum(["pendente", "valido", "invalido", "dispensado"]),
  motivo: z.string().trim().max(500, "Motivo muito longo (máximo 500 caracteres).").optional(),
});

/** Válido, inválido (motivo), não se aplica (motivo) ou de volta a pendente. */
export async function alterarItemEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaAlterar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("alterar_item_engenharia", {
    p_item_id: d.data.itemId,
    p_status: d.data.status,
    ...(d.data.motivo ? { p_motivo: d.data.motivo } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível alterar o item.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Item atualizado." };
}
