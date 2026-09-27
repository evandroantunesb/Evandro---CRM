"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MODOS_PRECO, type ResultadoAcao } from "@/lib/tipos";

const esquemaGerar = z.object({ negocioId: z.string().uuid(), modeloId: z.string().uuid().optional() });

/**
 * Cria (ou reaproveita) a proposta do negócio e devolve o link para compartilhar.
 * Se um modelo (do construtor de propostas) foi escolhido — ou a empresa tem um
 * modelo padrão publicado —, seus blocos ficam "congelados" na proposta nesse
 * momento: editar o modelo depois não muda uma proposta já emitida.
 */
export async function gerarLinkProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaGerar.safeParse({ negocioId: formData.get("negocioId"), modeloId: formData.get("modeloId") || undefined });
  if (!dados.success) return { ok: false, mensagem: "Negócio inválido." };

  const supabase = await criarClienteServidor();
  const { data: calculo } = await supabase
    .from("calculos_solares")
    .select("id")
    .eq("negocio_id", dados.data.negocioId)
    .maybeSingle();
  if (!calculo) return { ok: false, mensagem: "Calcule o kit antes de gerar a proposta." };

  let modeloId = dados.data.modeloId ?? null;
  if (!modeloId) {
    const { data: padrao } = await supabase
      .from("proposta_modelos")
      .select("id")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "publicado")
      .eq("padrao", true)
      .maybeSingle();
    modeloId = padrao?.id ?? null;
  }

  let capaVariante: string | null = null;
  let blocosEmitidos: unknown[] | null = null;
  if (modeloId) {
    const { data: modelo } = await supabase
      .from("proposta_modelos")
      .select("capa_variante, proposta_modelo_blocos(tipo, ordem, ativo, quebra_pagina, config)")
      .eq("id", modeloId)
      .eq("empresa_id", atual.empresaId)
      .eq("status", "publicado")
      .maybeSingle();
    if (modelo) {
      capaVariante = modelo.capa_variante;
      blocosEmitidos = (modelo.proposta_modelo_blocos ?? []).map((b) => ({
        tipo: b.tipo,
        ordem: b.ordem,
        ativo: b.ativo,
        quebra_pagina: b.quebra_pagina,
        config: b.config,
      }));
    }
  }

  const { error } = await supabase.from("propostas").upsert(
    {
      empresa_id: atual.empresaId,
      negocio_id: dados.data.negocioId,
      criado_por: atual.membroId,
      atualizado_por: atual.membroId,
      modelo_id: modeloId,
      capa_variante: capaVariante as never,
      blocos_emitidos: blocosEmitidos as never,
    },
    { onConflict: "negocio_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar a proposta.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
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
