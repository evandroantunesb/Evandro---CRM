"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { BUCKET_AVATARES, caminhoAvatarValido } from "@/lib/imagem-upload";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

export async function salvarPerfil(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await obterSessao();
  const nome = z.string().trim().min(2, "Informe seu nome").max(80, "Nome muito longo").safeParse(formData.get("nome"));
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("perfis").update({ nome: nome.data }).eq("id", sessao.userId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Perfil salvo." };
}

type ClienteServidor = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Apaga um arquivo do bucket de avatares. Falha não derruba a ação: arquivo órfão é só espaço perdido. */
async function removerArquivoAvatar(supabase: ClienteServidor, caminho: string) {
  try {
    await supabase.storage.from(BUCKET_AVATARES).remove([caminho]);
  } catch {
    // Idem: não bloqueia a ação principal.
  }
}

/**
 * Grava a foto de perfil (já enviada pelo navegador ao bucket `avatares`). O avatar é do usuário,
 * não da empresa: funciona mesmo sem empresa em uso. Só depois de gravar remove o arquivo anterior;
 * se não conseguir gravar, remove o recém-enviado.
 */
export async function definirAvatar(caminho: string): Promise<NonNullable<ResultadoAcao>> {
  const sessao = await obterSessao();
  if (typeof caminho !== "string" || !caminhoAvatarValido(sessao.userId, caminho)) {
    return { ok: false, mensagem: "Imagem inválida." };
  }

  const supabase = await criarClienteServidor();
  const { data: perfil } = await supabase.from("perfis").select("avatar_caminho").eq("id", sessao.userId).maybeSingle();
  if (!perfil) {
    await removerArquivoAvatar(supabase, caminho);
    return { ok: false, mensagem: "Perfil não encontrado." };
  }

  const { data: atualizados, error } = await supabase
    .from("perfis")
    .update({ avatar_caminho: caminho })
    .eq("id", sessao.userId)
    .select("id");
  if (error || !atualizados?.length) {
    await removerArquivoAvatar(supabase, caminho);
    return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar a foto.") };
  }

  if (perfil.avatar_caminho && perfil.avatar_caminho !== caminho) {
    await removerArquivoAvatar(supabase, perfil.avatar_caminho);
  }
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Foto salva." };
}

/** Tira a foto de perfil (volta às iniciais) e apaga o arquivo do bucket. */
export async function removerAvatar(): Promise<NonNullable<ResultadoAcao>> {
  const sessao = await obterSessao();
  const supabase = await criarClienteServidor();
  const { data: perfil } = await supabase.from("perfis").select("avatar_caminho").eq("id", sessao.userId).maybeSingle();
  if (!perfil) return { ok: false, mensagem: "Perfil não encontrado." };
  if (!perfil.avatar_caminho) return { ok: true, mensagem: "Você já está sem foto." };

  const { data: atualizados, error } = await supabase
    .from("perfis")
    .update({ avatar_caminho: null })
    .eq("id", sessao.userId)
    .select("id");
  if (error || !atualizados?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível remover a foto.") };

  // A coluna já foi limpa: se a remoção do arquivo falhar, fica só um órfão inofensivo.
  await removerArquivoAvatar(supabase, perfil.avatar_caminho);
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Foto removida." };
}
