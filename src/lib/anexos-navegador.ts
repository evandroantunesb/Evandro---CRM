import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Envia, do navegador direto ao Storage, cada arquivo para o caminho já reservado pelo servidor
 * (ver `reservarAnexosComCliente`). Devolve os nomes que não chegaram — o registro deles fica
 * como pendente na ficha até alguém enviar de novo ou remover.
 */
export async function enviarArquivosReservados(
  supabase: SupabaseClient<Database>,
  pares: { caminho: string; arquivo: File }[],
): Promise<string[]> {
  const falhas: string[] = [];
  for (const { caminho, arquivo } of pares) {
    const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
    if (error) falhas.push(arquivo.name || "arquivo");
  }
  return falhas;
}
