"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerDesligadas } from "@/lib/telas-empresa";
import type { ResultadoAcao } from "@/lib/tipos";

/** Grava as telas opcionais desligadas da empresa (só o admin; o banco confere de novo). Vale no próximo clique de todos. */
export async function salvarTelasEmpresa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const desligadas = lerDesligadas(String(formData.get("desligadas") ?? ""));
  if (!desligadas) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("empresa_telas").upsert({ empresa_id: atual.empresaId, desligadas }, { onConflict: "empresa_id" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar as telas.") };

  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Telas salvas." };
}
