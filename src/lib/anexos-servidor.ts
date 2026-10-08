import "server-only";
import { z } from "zod";
import { nomeDoObjeto } from "@/lib/anexos-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";

export const arquivoMetaSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  tamanho: z.number().int().nonnegative(),
  tipoMime: z.string().max(200),
});

export type ArquivoSemRegistro = { caminho: string; nome: string; tamanho: number; tipoMime: string };

/**
 * Confere a pasta do negócio no Storage contra os registros de `anexos`:
 * - `semRegistro`: arquivo que chegou mas não foi registrado (o navegador fechou entre o envio
 *   e o registro) — pode ser registrado pela ficha;
 * - `semArquivo`: registro cujo arquivo não está no Storage.
 * Se a listagem falhar, devolve `conferido: false` — a ficha avisa que não deu para conferir,
 * em vez de mostrar "tudo certo" (falha na listagem nunca esconde pendência).
 */
export async function conferirArquivos(
  supabase: SupabaseServidor,
  empresaId: string,
  negocioId: string,
  anexos: { id: string; caminho: string }[],
): Promise<{ conferido: true; semRegistro: ArquivoSemRegistro[]; semArquivo: Set<string> } | { conferido: false }> {
  const pasta = `${empresaId}/${negocioId}`;
  const { data, error } = await supabase.storage.from("anexos").list(pasta, { limit: 1000 });
  if (error || !data) return { conferido: false };
  const objetos = data.filter((o) => o.id); // pastas não têm id
  // Mais de 1000 objetos: a lista veio cortada, não dá para afirmar que falta algo.
  if (objetos.length >= 1000) return { conferido: false };
  const registrados = new Set(anexos.map((a) => a.caminho));
  const presentes = new Set(objetos.map((o) => `${pasta}/${o.name}`));
  return {
    conferido: true,
    semRegistro: objetos
      .filter((o) => !registrados.has(`${pasta}/${o.name}`))
      .map((o) => {
        const meta = (o.metadata ?? {}) as { size?: number; mimetype?: string };
        return { caminho: `${pasta}/${o.name}`, nome: nomeDoObjeto(o.name), tamanho: Number(meta.size ?? 0), tipoMime: meta.mimetype ?? "" };
      }),
    semArquivo: new Set(anexos.filter((a) => !presentes.has(a.caminho)).map((a) => a.id)),
  };
}
