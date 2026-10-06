import "server-only";

/** O pedaço do cliente Supabase que este helper usa (facilita testar sem banco). */
type ClienteStorage = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        caminhos: string[],
        expiraEmSegundos: number,
      ): PromiseLike<{
        data: { error: string | null; path: string | null; signedUrl: string | null }[] | null;
        error: unknown;
      }>;
    };
  };
};

/**
 * Gera, EM LOTE (uma chamada ao Storage), as URLs assinadas dos `caminhos` de um bucket privado.
 * Ignora nulos, vazios e repetidos; arquivos que falharem ao assinar (inexistentes, sem permissão)
 * ficam fora do mapa — quem exibe cai no fallback. Nunca lança: falha geral devolve mapa vazio.
 */
export async function assinarImagensEmLote(
  supabase: ClienteStorage,
  bucket: string,
  caminhos: readonly (string | null | undefined)[],
  expiraEmSegundos = 3600,
): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => !!c))];
  const urls = new Map<string, string>();
  if (!unicos.length) return urls;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unicos, expiraEmSegundos);
    if (error || !data) return urls;
    for (const item of data) {
      if (!item.error && item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  } catch {
    // Imagem é enfeite: se a assinatura falhar, a tela mostra o ícone.
  }
  return urls;
}
