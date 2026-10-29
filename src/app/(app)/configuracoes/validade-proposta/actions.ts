"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { VALIDADE_PROPOSTA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.coerce
  .number({ message: "Informe um número de dias." })
  .int("Use um número inteiro de dias.")
  .min(1, "A validade mínima é 1 dia.")
  .max(180, "A validade máxima é 180 dias.");

/** Grava a validade padrão da proposta da empresa (admin e gestor; o banco confere de novo pela política). */
export async function salvarValidadeProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...VALIDADE_PROPOSTA);
  const dias = esquema.safeParse(formData.get("validadeDias"));
  if (!dias.success) return { ok: false, mensagem: dias.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_preferencias")
    .upsert({ empresa_id: atual.empresaId, validade_dias: dias.data }, { onConflict: "empresa_id" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath("/configuracoes/validade-proposta");
  revalidatePath("/negocios", "layout");
  return { ok: true, mensagem: `Salvo. As próximas propostas já vêm com ${dias.data} dias de validade.` };
}
