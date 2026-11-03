"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { LIMITES_SIMPLES } from "@/lib/propostas/proposta-simples";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const texto = z
  .string()
  .trim()
  .max(LIMITES_SIMPLES.pagamento, `Cada condição de pagamento tem no máximo ${LIMITES_SIMPLES.pagamento} caracteres.`)
  .transform((v) => v || null);

const esquema = z.object({
  validadeDias: z.enum(["", "7", "15", "30"]).transform((v) => (v ? Number(v) : null)),
  pagamentoAvista: texto,
  pagamentoCartao: texto,
  pagamentoFinanciamento: texto,
});

/**
 * Gestor ou admin define o prazo de validade (7, 15 ou 30 dias) e as três formas de pagamento da proposta simples
 * (D1/D2). Vale só para as próximas emissões: o que já foi emitido guarda prazo, condições e PDF congelados.
 * Campo vazio grava nulo e bloqueia a emissão até ser completado. A RLS confere o papel de novo no banco.
 */
export async function salvarCondicoesComerciais(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin", "gestor");
  const dados = esquema.safeParse({
    validadeDias: formData.get("validadeDias") ?? "",
    pagamentoAvista: formData.get("pagamentoAvista") ?? "",
    pagamentoCartao: formData.get("pagamentoCartao") ?? "",
    pagamentoFinanciamento: formData.get("pagamentoFinanciamento") ?? "",
  });
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("proposta_condicoes_comerciais").upsert(
    {
      empresa_id: atual.empresaId,
      validade_dias: dados.data.validadeDias,
      pagamento_avista: dados.data.pagamentoAvista,
      pagamento_cartao: dados.data.pagamentoCartao,
      pagamento_financiamento: dados.data.pagamentoFinanciamento,
      atualizado_por: atual.membroId,
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar as condições da proposta.") };

  revalidatePath("/configuracoes/condicoes-proposta");
  return { ok: true, mensagem: "Condições salvas. Valem para as próximas propostas; as já emitidas não mudam." };
}
