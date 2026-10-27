"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const dadosResponsavel = z.object({
  setor: z.enum(["compras", "engenharia", "operacional"]),
  membroId: z.union([z.literal(""), z.string().uuid()]),
});

export async function salvarResponsavelPadraoObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = dadosResponsavel.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Escolha um setor e um colaborador válido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_responsavel_padrao_obra", {
    p_empresa_id: atual.empresaId,
    p_setor: dados.data.setor,
    // A RPC recebe NULL para limpar; o gerador de tipos não marca parâmetros SQL nullable.
    p_membro_id: (dados.data.membroId || null) as string,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o responsável padrão.") };
  revalidatePath("/configuracoes/obras");
  return { ok: true, mensagem: dados.data.membroId ? "Responsável padrão atualizado." : "Responsável padrão removido." };
}
