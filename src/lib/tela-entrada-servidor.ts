import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { COOKIE_EMPRESA } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { BUCKET_TELA_ENTRADA, TELA_ENTRADA_PADRAO, empresaIdValido, montarTelaEntrada, urlFaixa, type TelaEntrada } from "@/lib/tela-entrada";

/**
 * Tela de entrada da empresa informada ou, sem ela, da empresa lembrada no aparelho (cookie gravado no
 * login). As telas são sem login: o servidor lê com a chave de serviço, como as outras telas públicas, e
 * só a frase, o texto e a imagem de empresa ativa. Nunca derruba a tela: qualquer falha (empresa sem
 * personalização, banco fora do ar, migration ainda não aplicada) devolve o padrão do Raion.
 */
export async function carregarTelaEntrada(empresaId?: string | null): Promise<TelaEntrada> {
  try {
    const id = empresaId === undefined ? (await cookies()).get(COOKIE_EMPRESA)?.value : empresaId;
    if (!empresaIdValido(id)) return TELA_ENTRADA_PADRAO;
    const supabase = criarClienteAdmin();
    const { data, error } = await supabase
      .from("empresa_tela_entrada")
      .select("frase, texto, imagem_caminho, empresas!inner(situacao)")
      .eq("empresa_id", id)
      .eq("empresas.situacao", "ativa")
      .maybeSingle();
    if (error) return TELA_ENTRADA_PADRAO;
    return montarTelaEntrada(data, (caminho) => supabase.storage.from(BUCKET_TELA_ENTRADA).getPublicUrl(caminho).data.publicUrl);
  } catch {
    return TELA_ENTRADA_PADRAO;
  }
}

/**
 * Dados da tela de entrada e da faixa para quem edita (o admin, pela RLS): o formulário de Configurações › Tela de
 * entrada e o passo 3 do assistente.
 */
export async function carregarImagensParaEditar(supabase: SupabaseServidor, empresaId: string) {
  const { data: linha } = await supabase
    .from("empresa_tela_entrada")
    .select("frase, texto, imagem_caminho, faixa_caminho, faixa_usa_entrada, updated_at")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const publica = (caminho: string) => supabase.storage.from(BUCKET_TELA_ENTRADA).getPublicUrl(caminho).data.publicUrl;
  const tela = montarTelaEntrada(linha, publica);
  return {
    atualizadoEm: linha?.updated_at ?? null,
    formulario: {
      frase: linha?.frase ?? "",
      texto: linha?.texto ?? "",
      imagem: tela.imagem,
      nomeImagem: tela.imagemPersonalizada ? "Imagem da empresa" : "Paisagem do Raion (padrão)",
      personalizada: !!linha,
    },
    faixa: {
      usaEntrada: linha?.faixa_usa_entrada ?? true,
      imagemEntrada: linha?.imagem_caminho ? publica(linha.imagem_caminho) : null,
      imagemFaixa: linha?.faixa_caminho ? publica(linha.faixa_caminho) : null,
    },
  };
}

/** Foto da faixa do topo da empresa em uso (para todos os membros; o bucket é público). Falha = paisagem do Raion. */
export const carregarFaixaEmpresa = cache(async (empresaId: string): Promise<string | null> => {
  try {
    const supabase = criarClienteAdmin();
    const { data, error } = await supabase
      .from("empresa_tela_entrada")
      .select("imagem_caminho, faixa_caminho, faixa_usa_entrada")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (error) return null;
    return urlFaixa(data, (caminho) => supabase.storage.from(BUCKET_TELA_ENTRADA).getPublicUrl(caminho).data.publicUrl);
  } catch {
    return null;
  }
});
