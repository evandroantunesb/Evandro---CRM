"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { desligadasParaGravar, lerDesligadas, lerSetoresDesligados } from "@/lib/telas-empresa";
import type { ResultadoAcao } from "@/lib/tipos";

/** Grava as telas opcionais e os setores da obra desligados da empresa (só o admin; o banco confere de novo). Vale no próximo clique de todos. */
export async function salvarTelasEmpresa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const desligadas = lerDesligadas(String(formData.get("desligadas") ?? ""));
  const setoresDesligados = lerSetoresDesligados(String(formData.get("setores_desligados") ?? ""));
  if (!desligadas || !setoresDesligados) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  // O Eletroposto sem liberação fica como está gravado (o formulário não o mostra).
  const [gravadas, empresa] = await Promise.all([
    supabase.from("empresa_telas").select("desligadas").eq("empresa_id", atual.empresaId).maybeSingle(),
    supabase.from("empresas").select("eletroposto_ativo").eq("id", atual.empresaId).maybeSingle(),
  ]);
  if (gravadas.error || empresa.error) return { ok: false, mensagem: "Não foi possível ler as telas agora. Recarregue a página e tente de novo." };

  const { error } = await supabase.from("empresa_telas").upsert(
    {
      empresa_id: atual.empresaId,
      desligadas: desligadasParaGravar(desligadas, gravadas.data?.desligadas ?? [], !!empresa.data?.eletroposto_ativo),
      setores_desligados: setoresDesligados,
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar as telas.") };

  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Telas salvas." };
}
