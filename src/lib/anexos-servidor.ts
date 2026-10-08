import "server-only";
import { z } from "zod";
import { nomeSeguro, problemaArquivo, type ArquivoMeta } from "@/lib/anexos-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CATEGORIAS_ANEXO, type CategoriaAnexo } from "@/lib/tipos";

export const arquivoMetaSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  tamanho: z.number().int().nonnegative(),
  tipoMime: z.string().max(200),
});

export const reservaSchema = arquivoMetaSchema.extend({ categoria: z.enum(CATEGORIAS_ANEXO) });

export type Reserva = { id: string; caminho: string };

/**
 * Reserva o registro de cada arquivo em `anexos` (uma única inserção: todos ou nenhum) e devolve
 * o caminho no Storage para o navegador enviar o conteúdo. Arquivo vazio ou acima de 20 MB é
 * recusado antes de gravar. Enquanto o arquivo não chega, o registro aparece como pendente.
 */
export async function reservarAnexosComCliente(
  supabase: SupabaseServidor,
  dados: { empresaId: string; negocioId: string; arquivos: (ArquivoMeta & { categoria: CategoriaAnexo })[] },
): Promise<{ ok: true; reservas: Reserva[] } | { ok: false; mensagem: string }> {
  const { empresaId, negocioId, arquivos } = dados;
  if (!arquivos.length) return { ok: true, reservas: [] };
  const problema = arquivos.map(problemaArquivo).find(Boolean);
  if (problema) return { ok: false, mensagem: problema };
  const linhas = arquivos.map((a) => ({
    empresa_id: empresaId,
    negocio_id: negocioId,
    caminho: `${empresaId}/${negocioId}/${nomeSeguro(a.nome)}`,
    nome: a.nome,
    tamanho: a.tamanho,
    tipo_mime: a.tipoMime || null,
    categoria: a.categoria,
  }));
  const { data, error } = await supabase.from("anexos").insert(linhas).select("id, caminho");
  if (error || data?.length !== linhas.length) return { ok: false, mensagem: "Não foi possível registrar os arquivos." };
  // Mesma ordem dos arquivos recebidos (casando pelo caminho, que é único).
  const porCaminho = new Map(data.map((r) => [r.caminho, r.id]));
  return { ok: true, reservas: linhas.map((l) => ({ id: porCaminho.get(l.caminho)!, caminho: l.caminho })) };
}

/** Ids dos anexos registrados cujo arquivo não está no Storage (envio que não chegou). */
export async function anexosNaoRecebidos(
  supabase: SupabaseServidor,
  empresaId: string,
  negocioId: string,
  anexos: { id: string; caminho: string }[],
): Promise<Set<string>> {
  if (!anexos.length) return new Set();
  const { data, error } = await supabase.storage.from("anexos").list(`${empresaId}/${negocioId}`, { limit: 1000 });
  // Sem conseguir listar, não marca nada como pendente (evita alarme falso).
  if (error || !data) return new Set();
  const presentes = new Set(data.map((o) => `${empresaId}/${negocioId}/${o.name}`));
  return new Set(anexos.filter((a) => !presentes.has(a.caminho)).map((a) => a.id));
}
