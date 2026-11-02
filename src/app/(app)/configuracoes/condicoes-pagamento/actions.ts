"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, esquemaPreferencias, lerTaxasDoFormulario } from "@/lib/condicoes-pagamento";
import { mensagemErro } from "@/lib/erros";
import { CONDICOES_PAGAMENTO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/** Descontos à vista sem aprovação e Personalizado (admin e gestor; o banco confere de novo pela política). */
export async function salvarPreferenciasCondicoes(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...CONDICOES_PAGAMENTO);
  const dados = esquemaPreferencias.safeParse({
    descontoMaxVendedor: formData.get("descontoMaxVendedor") ?? "",
    descontoMaxGestor: formData.get("descontoMaxGestor") ?? "",
    personalizadoAtivo: formData.get("personalizadoAtivo") ?? undefined,
  });
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("condicoes_pagamento_preferencias").upsert(
    {
      empresa_id: atual.empresaId,
      desconto_max_vendedor: dados.data.descontoMaxVendedor,
      desconto_max_gestor: dados.data.descontoMaxGestor,
      personalizado_ativo: dados.data.personalizadoAtivo,
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath("/configuracoes/condicoes-pagamento");
  return { ok: true, mensagem: "Salvo. Vale para as próximas propostas." };
}

/** Parcelas disponíveis e taxas de um meio (cartão ou boleto), trocadas de uma vez. */
export async function salvarTaxasParcelamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...CONDICOES_PAGAMENTO);
  const meio = z.enum(MEIOS_PARCELAMENTO).safeParse(formData.get("meio"));
  if (!meio.success) return { ok: false, mensagem: "Meio de pagamento inválido." };
  const lidas = lerTaxasDoFormulario(formData);
  if (!lidas.ok) return lidas;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_taxas_parcelamento", { p_empresa_id: atual.empresaId, p_meio: meio.data, p_taxas: lidas.taxas });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath("/configuracoes/condicoes-pagamento");
  const rotulo = ROTULO_MEIO_PARCELAMENTO[meio.data];
  return {
    ok: true,
    mensagem: lidas.taxas.length ? `${rotulo}: ${lidas.taxas.length} opções de parcelamento salvas.` : `${rotulo} fica indisponível para os vendedores.`,
  };
}
