import "server-only";
import { cookies } from "next/headers";
import { COOKIE_EMPRESA } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_TELA_ENTRADA, TELA_ENTRADA_PADRAO, empresaIdValido, montarTelaEntrada, type TelaEntrada } from "@/lib/tela-entrada";

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
