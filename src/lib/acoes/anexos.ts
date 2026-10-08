"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { ANEXOS_E_NOTAS } from "@/lib/permissoes";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { objetoConfereComNome, problemaArquivo } from "@/lib/anexos-regras";
import { localizarObjeto } from "@/lib/anexos-servidor";
import { CATEGORIAS_ANEXO, type ResultadoAcao } from "@/lib/tipos";

/**
 * Registra em `anexos` um arquivo que o navegador já enviou ao Storage (é este registro que
 * aparece como "anexo adicionado" na linha do tempo). Usado pelo cartão Arquivos, pelo cadastro
 * do negócio, pela fatura de "Dados do negócio" e para registrar um arquivo que chegou sem
 * registro. Não confia no navegador:
 * - o caminho tem de ser exatamente `empresa/negócio/objeto`, na pasta da empresa da sessão;
 * - o objeto tem de existir no Storage, visto com o cliente de quem chama (RLS da pasta);
 * - o nome informado tem de corresponder ao objeto; tamanho e tipo vêm do Storage.
 * Se a gravação falhar, o arquivo fica no Storage (aparece na ficha como "sem registro") —
 * nada é apagado aqui, então nunca se remove arquivo de outra tentativa.
 */
export async function registrarAnexo(dados: {
  negocioId: string;
  caminho: string;
  nome: string;
  /** Ignorados: tamanho e tipo vêm do Storage. Mantidos por compatibilidade com quem chama. */
  tamanho?: number;
  tipoMime?: string;
  categoria?: string;
}): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...ANEXOS_E_NOTAS);
  const d = z
    .object({
      negocioId: z.string().uuid(),
      caminho: z.string().min(1).max(400),
      nome: z.string().trim().min(1).max(200),
      categoria: z.enum(CATEGORIAS_ANEXO).default("geral"),
    })
    .safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const pasta = `${atual.empresaId}/${d.data.negocioId}`;
  const objeto = d.data.caminho.slice(pasta.length + 1);
  if (!d.data.caminho.startsWith(`${pasta}/`) || !objeto || objeto.includes("/") || !objetoConfereComNome(objeto, d.data.nome)) {
    return { ok: false, mensagem: "Dados do arquivo inválidos." };
  }

  const supabase = await criarClienteServidor();
  const real = await localizarObjeto(supabase, pasta, objeto);
  if (real === "erro") return { ok: false, mensagem: "Não foi possível conferir o arquivo no armazenamento. Tente de novo." };
  if (!real) return { ok: false, mensagem: "Arquivo não encontrado no armazenamento. Envie de novo." };
  // Vazio nunca vira registro (acima de 20 MB o bucket já recusa no envio).
  const problema = problemaArquivo({ nome: d.data.nome, tamanho: real.tamanho });
  if (problema) return { ok: false, mensagem: problema };

  const { error } = await supabase.from("anexos").insert({
    empresa_id: atual.empresaId,
    negocio_id: d.data.negocioId,
    caminho: d.data.caminho,
    nome: d.data.nome,
    tamanho: real.tamanho,
    tipo_mime: real.tipoMime || null,
    categoria: d.data.categoria,
  });
  if (error) {
    return { ok: false, mensagem: error.code === "23505" ? "Este arquivo já está registrado." : "Não foi possível registrar o arquivo." };
  }
  revalidatePath(`/negocios/${d.data.negocioId}`);
  return { ok: true, mensagem: "Arquivo anexado." };
}

export async function apagarAnexo(formData: FormData) {
  await exigirPapel(...ANEXOS_E_NOTAS);
  const id = z.string().uuid().safeParse(formData.get("anexoId"));
  if (!id.success) return;

  // O banco decide se pode apagar (quem enviou ou admin); só então o arquivo sai do Storage.
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anexos").delete().eq("id", id.data).select("caminho, negocio_id");
  if (!data?.[0]) return;
  await criarClienteAdmin().storage.from("anexos").remove([data[0].caminho]);
  revalidatePath(`/negocios/${data[0].negocio_id}`);
}
