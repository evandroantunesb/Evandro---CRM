import "server-only";
import { camposSemDado, montarDadosContrato, preencherModeloContrato, type FontesContrato } from "@/lib/contrato";
import { lerFontesNegocio } from "@/lib/contratos-geracao";
import { formatarMoeda } from "@/lib/formatacao";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Procuração (item 1 do roadmap, 17/11/2026): o modelo da empresa preenchido com os mesmos campos do contrato. Não é
 * gravada: cada download preenche de novo. Campo sem dado sai "—" (a assinatura e o registro chegam no item 2).
 */

export const MENSAGEM_SEM_MODELO_PROCURACAO = "A empresa ainda não tem modelo de procuração.";

export type ProcuracaoMontada =
  | { situacao: "sem_modelo" }
  | { situacao: "nao_encontrado" }
  | { situacao: "ok"; titulo: string; conteudo: string; arquivo: string };

/** Nome do arquivo: `procuracao-<título do negócio>.pdf`, só letras e números. */
export function arquivoProcuracao(tituloNegocio: string | null): string {
  return `procuracao-${(tituloNegocio || "documento").replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
}

/** O modelo tem texto (só espaços e linhas vazias não contam, como em `tem_modelo_procuracao`). */
export function modeloComTexto(conteudo: string | null | undefined): conteudo is string {
  return !!conteudo && /\S/.test(conteudo);
}

/** Preenche o modelo; o título do PDF é o nome do cliente (sem ele, o título do negócio). */
export function preencherProcuracao(modelo: string, fontes: FontesContrato): { titulo: string; conteudo: string } {
  return {
    titulo: fontes.contato?.nome?.trim() || fontes.negocio.titulo,
    conteudo: preencherModeloContrato(modelo, montarDadosContrato(fontes)),
  };
}

async function lerModelo(supabase: SupabaseServidor, empresaId: string) {
  const { data } = await supabase.from("modelos_procuracao").select("conteudo").eq("empresa_id", empresaId).maybeSingle();
  return modeloComTexto(data?.conteudo) ? data.conteudo : null;
}

async function fontesDoNegocio(supabase: SupabaseServidor, empresaId: string, negocioId: string, agora: Date): Promise<FontesContrato | null> {
  const { negocio, calculo, itensKit, empresa, vendedorNome } = await lerFontesNegocio(supabase, empresaId, negocioId);
  if (!negocio) return null;
  return {
    empresa,
    negocio,
    contato: negocio.contatos as unknown as FontesContrato["contato"],
    calculo,
    itensKit,
    vendedorNome,
    agora,
    formatarMoeda: (v) => formatarMoeda(v),
  };
}

/** Procuração do negócio para o PDF, sob a RLS de quem pede. */
export async function montarProcuracaoNegocio(
  supabase: SupabaseServidor,
  empresaId: string,
  negocioId: string,
  agora = new Date(),
): Promise<ProcuracaoMontada> {
  const modelo = await lerModelo(supabase, empresaId);
  if (!modelo) return { situacao: "sem_modelo" };
  const fontes = await fontesDoNegocio(supabase, empresaId, negocioId, agora);
  if (!fontes) return { situacao: "nao_encontrado" };
  return { situacao: "ok", ...preencherProcuracao(modelo, fontes), arquivo: arquivoProcuracao(fontes.negocio.titulo) };
}

/** Para o cartão da ficha: se há modelo e os rótulos dos campos que o modelo usa e o negócio ainda não tem. */
export async function carregarProcuracaoNegocio(
  supabase: SupabaseServidor,
  empresaId: string,
  negocioId: string,
  agora = new Date(),
): Promise<{ temModelo: boolean; faltando: string[] }> {
  const modelo = await lerModelo(supabase, empresaId);
  if (!modelo) return { temModelo: false, faltando: [] };
  const fontes = await fontesDoNegocio(supabase, empresaId, negocioId, agora);
  return { temModelo: true, faltando: fontes ? camposSemDado(modelo, montarDadosContrato(fontes)) : [] };
}
