import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { CategoriaAnexo } from "@/lib/tipos";

/** Mesmo limite do bucket `anexos` (20 MB). */
export const LIMITE_ANEXO = 20 * 1024 * 1024;

/** Nome seguro para o caminho no Storage (o nome original fica no registro). */
function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
  return `${crypto.randomUUID()}-${limpo || "arquivo"}`;
}

/**
 * Envia um arquivo direto do servidor (anexos escolhidos na criação do negócio ou na
 * edição dos dados). Sempre diz se deu certo: quem chama decide como avisar o usuário,
 * nunca mostra sucesso com o arquivo perdido.
 */
export async function enviarAnexoComCliente(
  supabase: SupabaseServidor,
  dados: { empresaId: string; negocioId: string; arquivo: File; categoria: CategoriaAnexo },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { empresaId, negocioId, arquivo, categoria } = dados;
  const nome = arquivo.name || "arquivo";
  if (!arquivo.size) return { ok: false, motivo: `${nome}: arquivo vazio` };
  if (arquivo.size > LIMITE_ANEXO) return { ok: false, motivo: `${nome}: maior que 20 MB` };
  const caminho = `${empresaId}/${negocioId}/${nomeSeguro(nome)}`;
  const { error: erroUpload } = await supabase.storage
    .from("anexos")
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (erroUpload) return { ok: false, motivo: `${nome}: falha no envio` };
  const { error: erroRegistro } = await supabase.from("anexos").insert({
    empresa_id: empresaId,
    negocio_id: negocioId,
    caminho,
    nome,
    tamanho: arquivo.size,
    tipo_mime: arquivo.type || null,
    categoria,
  });
  if (erroRegistro) {
    // Sem registro, o arquivo não aparece para ninguém: remove para não ocupar espaço.
    await criarClienteAdmin().storage.from("anexos").remove([caminho]);
    return { ok: false, motivo: `${nome}: falha ao registrar` };
  }
  return { ok: true };
}

/** Arquivos não vazios de um campo do formulário. */
export function arquivosDoCampo(formData: FormData, campo: string): File[] {
  return formData.getAll(campo).filter((v): v is File => v instanceof File && v.size > 0);
}
