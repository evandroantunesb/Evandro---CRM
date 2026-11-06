"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nomeSeguro } from "@/lib/anexos-regras";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import { mensagemErro } from "@/lib/erros";
import { ENGENHARIA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({ obraId: z.string().uuid(), itemId: z.string().uuid(), anexoId: z.string().uuid() });

/**
 * Usa o anexo do negócio como nova versão de um item do checklist que é documento do cliente (P2c,
 * 20261128100000_documentos_cliente_engenharia_administrativo.sql): copia o arquivo para a pasta da obra (a cópia
 * fica mesmo que o anexo seja apagado depois) e a RPC registra a versão. Quem copia precisa ler o anexo e enviar à
 * pasta da obra; a RPC confere de novo o item, o anexo, a pasta e o tamanho da cópia.
 */
export async function usarArquivoNegocioEngenharia(dados: z.input<typeof esquema>): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...ENGENHARIA);
  const d = esquema.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { data: doNegocio, error: erroLista } = await supabase.rpc("documentos_negocio_engenharia", { p_obra_id: d.data.obraId });
  if (erroLista) return { ok: false, mensagem: mensagemErro(erroLista, "Não foi possível ler o arquivo do negócio.") };
  const anexo = (doNegocio ?? []).find((a) => a.anexo_id === d.data.anexoId);
  if (!anexo) return { ok: false, mensagem: "O arquivo do negócio mudou. Atualize a página." };
  const destino = `${atual.empresaId}/${d.data.obraId}/${nomeSeguro(anexo.nome)}`;
  const { error: erroCopia } = await supabase.storage.from("anexos").copy(anexo.caminho, destino, { destinationBucket: BUCKET_DOCUMENTOS_ENGENHARIA });
  if (erroCopia) return { ok: false, mensagem: "Não foi possível copiar o arquivo do negócio." };
  const { error } = await supabase.rpc("usar_documento_negocio_engenharia", { p_item_id: d.data.itemId, p_anexo_id: anexo.anexo_id, p_caminho: destino });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível usar o arquivo do negócio.") };
  revalidatePath("/engenharia");
  revalidatePath(`/engenharia/${d.data.obraId}`);
  revalidatePath(`/obras/${d.data.obraId}`);
  return { ok: true, mensagem: "Arquivo do negócio usado no item." };
}
