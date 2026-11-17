"use server";

import { revalidatePath } from "next/cache";
import { conferirTextoModelo } from "@/lib/contrato";
import { mensagemErro } from "@/lib/erros";
import { EDITAR_MODELO_CONTRATO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/** Modelo de procuração da empresa: mesmos campos e mesmas regras do modelo de contrato. */
export async function salvarModeloProcuracao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...EDITAR_MODELO_CONTRATO);
  const conteudo = conferirTextoModelo(formData.get("conteudo"));
  if (!conteudo.ok) return conteudo;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("modelos_procuracao")
    .upsert({ empresa_id: atual.empresaId, conteudo: conteudo.conteudo, atualizado_por: atual.membroId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o modelo.") };

  revalidatePath("/configuracoes/procuracao");
  return { ok: true, mensagem: "Modelo salvo." };
}
