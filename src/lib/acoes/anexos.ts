"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CATEGORIAS_ANEXO, type CategoriaAnexo, type ResultadoAcao } from "@/lib/tipos";

/** Nome seguro para o caminho no Storage (o nome original fica no registro). */
function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
  return `${crypto.randomUUID()}-${limpo || "arquivo"}`;
}

const LIMITE_ANEXO = 20 * 1024 * 1024;

/**
 * Envia um arquivo direto do servidor (ex.: anexos escolhidos ainda na criação
 * do negócio, antes de existir uma tela para o upload de cliente-para-Storage).
 * Não bloqueia a operação principal se falhar — só não anexa o arquivo.
 */
export async function enviarAnexoNoServidor(
  supabase: SupabaseServidor,
  dados: { empresaId: string; negocioId: string; arquivo: File; categoria: CategoriaAnexo },
) {
  const { empresaId, negocioId, arquivo, categoria } = dados;
  if (!arquivo.size || arquivo.size > LIMITE_ANEXO) return;
  const caminho = `${empresaId}/${negocioId}/${nomeSeguro(arquivo.name)}`;
  const { error: erroUpload } = await supabase.storage
    .from("anexos")
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (erroUpload) return;
  const { error: erroRegistro } = await supabase.from("anexos").insert({
    empresa_id: empresaId,
    negocio_id: negocioId,
    caminho,
    nome: arquivo.name || "arquivo",
    tamanho: arquivo.size,
    tipo_mime: arquivo.type || null,
    categoria,
  });
  if (erroRegistro) await criarClienteAdmin().storage.from("anexos").remove([caminho]);
}

/** O arquivo já foi enviado pelo navegador direto para o Storage; aqui só registramos. */
export async function registrarAnexo(dados: {
  negocioId: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  categoria?: string;
}): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const d = z
    .object({
      negocioId: z.string().uuid(),
      caminho: z.string().min(1),
      nome: z.string().trim().min(1).max(200),
      tamanho: z.number().int().nonnegative(),
      tipoMime: z.string().max(200),
      categoria: z.enum(CATEGORIAS_ANEXO).default("geral"),
    })
    .safeParse(dados);
  if (!d.success || !d.data.caminho.startsWith(`${atual.empresaId}/${d.data.negocioId}/`)) {
    return { ok: false, mensagem: "Dados do arquivo inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anexos").insert({
    empresa_id: atual.empresaId,
    negocio_id: d.data.negocioId,
    caminho: d.data.caminho,
    nome: d.data.nome,
    tamanho: d.data.tamanho,
    tipo_mime: d.data.tipoMime || null,
    categoria: d.data.categoria,
  });
  if (error) {
    // Sem registro, o arquivo não aparece para ninguém: remove para não ocupar espaço,
    // desde que o usuário veja o negócio e o caminho não seja de um anexo já registrado.
    const admin = criarClienteAdmin();
    const [{ data: negocio }, { data: registrado }] = await Promise.all([
      supabase.from("negocios").select("id").eq("id", d.data.negocioId).maybeSingle(),
      admin.from("anexos").select("id").eq("caminho", d.data.caminho).maybeSingle(),
    ]);
    if (negocio && !registrado) await admin.storage.from("anexos").remove([d.data.caminho]);
    return { ok: false, mensagem: "Não foi possível registrar o arquivo." };
  }
  revalidatePath(`/negocios/${d.data.negocioId}`);
  return { ok: true, mensagem: "Arquivo anexado." };
}

export async function apagarAnexo(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("anexoId"));
  if (!id.success) return;

  // O banco decide se pode apagar (quem enviou ou admin); só então o arquivo sai do Storage.
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anexos").delete().eq("id", id.data).select("caminho, negocio_id");
  if (!data?.[0]) return;
  await criarClienteAdmin().storage.from("anexos").remove([data[0].caminho]);
  revalidatePath(`/negocios/${data[0].negocio_id}`);
}
