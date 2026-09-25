"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MODOS_PRECO, type ResultadoAcao } from "@/lib/tipos";

/** Cria (ou reaproveita) a proposta do negócio e devolve o link para compartilhar. */
export async function gerarLinkProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return { ok: false, mensagem: "Negócio inválido." };

  const supabase = await criarClienteServidor();
  const { data: calculo } = await supabase
    .from("calculos_solares")
    .select("id")
    .eq("negocio_id", id.data)
    .maybeSingle();
  if (!calculo) return { ok: false, mensagem: "Calcule o kit antes de gerar a proposta." };

  const { error } = await supabase.from("propostas").upsert(
    { empresa_id: atual.empresaId, negocio_id: id.data, criado_por: atual.membroId, atualizado_por: atual.membroId },
    { onConflict: "negocio_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar a proposta.") };

  revalidatePath(`/negocios/${id.data}`);
  return { ok: true, mensagem: "Proposta pronta." };
}

export async function definirModoPreco(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = z
    .object({ negocioId: z.string().uuid(), modoPreco: z.enum(MODOS_PRECO) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("propostas")
    .update({ modo_preco: dados.data.modoPreco, atualizado_por: atual.membroId })
    .eq("negocio_id", dados.data.negocioId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Salvo." };
}
