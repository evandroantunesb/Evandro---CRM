import "server-only";
import { BUCKET_AVATARES } from "@/lib/imagem-upload";
import { assinarImagensEmLote } from "@/lib/storage-imagens";

export { BUCKET_AVATARES };

/**
 * Assina, EM LOTE (uma chamada ao Storage), as fotos de perfil dos `caminhos` (perfis.avatar_caminho),
 * com a sessão de quem está vendo: a política do bucket só deixa assinar a foto do próprio usuário
 * e de quem compartilha empresa com ele. Devolve `caminho -> URL assinada (1 h)`; quem não tem foto
 * (ou falhou ao assinar) fica fora do mapa e a tela mostra as iniciais. Cada tela chama uma vez
 * com todos os caminhos dela — nunca uma chamada por linha.
 */
export function assinarAvatares(
  supabase: Parameters<typeof assinarImagensEmLote>[0],
  caminhos: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  return assinarImagensEmLote(supabase, BUCKET_AVATARES, caminhos);
}
