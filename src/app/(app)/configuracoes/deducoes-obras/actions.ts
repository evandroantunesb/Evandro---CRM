"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MENSAGEM_NUMERO_BR, lerNumeroBr } from "@/lib/formatacao";
import { FINANCEIRO_OBRA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const percentual = z
  .string()
  .trim()
  // Vazio vale 0%.
  .transform((v) => lerNumeroBr(v) ?? 0)
  .pipe(z.number({ message: `Percentual inválido. ${MENSAGEM_NUMERO_BR}` }).min(0, "Percentual inválido.").max(100, "Percentual inválido."));

/** Impostos e comissões (% da venda) descontados no lucro das obras. Admin e gestor; o banco confere de novo. */
export async function salvarDeducoesObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...FINANCEIRO_OBRA);
  const dados = z.object({ impostos_percentual: percentual, comissoes_percentual: percentual }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  if (dados.data.impostos_percentual + dados.data.comissoes_percentual > 100) return { ok: false, mensagem: "Impostos e comissões somados não passam de 100%." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("obra_deducoes").update(dados.data).eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath("/configuracoes/deducoes-obras");
  return { ok: true, mensagem: "Salvo. Vale para o lucro de todas as obras." };
}
