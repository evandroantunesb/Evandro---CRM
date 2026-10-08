import type { SupabaseClient } from "@supabase/supabase-js";
import { caminhoAnexo, metaArquivo, problemaArquivo } from "@/lib/anexos-regras";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoriaAnexo, ResultadoAcao } from "@/lib/tipos";

/** A ação `registrarAnexo` (recebida por parâmetro para o mesmo código servir à tela e aos testes). */
type Registrar = (dados: {
  negocioId: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  categoria?: string;
}) => Promise<ResultadoAcao>;

/**
 * Envia cada arquivo do navegador direto ao Storage e, só depois que chegou, registra em
 * `anexos` (a linha do tempo nunca diz "anexo adicionado" para arquivo que não chegou).
 * Devolve "nome: motivo" de cada arquivo que não foi anexado.
 */
export async function enviarArquivos(
  supabase: SupabaseClient<Database>,
  registrar: Registrar,
  destino: { empresaId: string; negocioId: string },
  itens: { arquivo: File; categoria: CategoriaAnexo }[],
): Promise<string[]> {
  const falhas: string[] = [];
  for (const { arquivo, categoria } of itens) {
    const meta = metaArquivo(arquivo);
    const problema = problemaArquivo(meta);
    if (problema) {
      falhas.push(problema);
      continue;
    }
    const caminho = caminhoAnexo(destino.empresaId, destino.negocioId, meta.nome);
    const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: meta.tipoMime || undefined });
    if (error) {
      falhas.push(`"${meta.nome}": falha no envio`);
      continue;
    }
    const r = await registrar({ negocioId: destino.negocioId, caminho, ...meta, categoria });
    if (!r?.ok) falhas.push(`"${meta.nome}": ${r?.mensagem ?? "não foi registrado"}`);
  }
  return falhas;
}
