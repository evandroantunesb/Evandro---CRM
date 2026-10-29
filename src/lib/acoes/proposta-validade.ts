"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { VALIDADE_PADRAO_PROPOSTA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  validade_dias: z.coerce.number().int().min(1).max(180),
});

/** Validade padrão da proposta da empresa: precedência mais alta sobre o modelo e os 10 dias fixos. */
export async function salvarValidadePadraoProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...VALIDADE_PADRAO_PROPOSTA);
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Informe um número de dias entre 1 e 180." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("proposta_preferencias").upsert(
    { empresa_id: atual.empresaId, validade_dias: dados.data.validade_dias, atualizado_por: atual.membroId },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath("/configuracoes/propostas/validade-padrao");
  return { ok: true, mensagem: "Validade padrão salva." };
}
