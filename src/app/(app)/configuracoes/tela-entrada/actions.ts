"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  BUCKET_TELA_ENTRADA,
  LIMITE_FRASE_ENTRADA,
  LIMITE_TEXTO_ENTRADA,
  caminhoImagemEntradaValido,
  normalizarTextoEntrada,
} from "@/lib/tela-entrada";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  frase: z.string().max(LIMITE_FRASE_ENTRADA, `A frase principal vai até ${LIMITE_FRASE_ENTRADA} caracteres.`).nullable(),
  texto: z.string().max(LIMITE_TEXTO_ENTRADA, `O texto de apoio vai até ${LIMITE_TEXTO_ENTRADA} caracteres.`).nullable(),
});

function revalidar() {
  revalidatePath("/configuracoes/tela-entrada");
  revalidatePath("/login");
  revalidatePath("/recuperar-senha");
}

/**
 * Grava a frase, o texto e, quando o admin trocou a foto, o caminho da imagem já enviada pelo navegador
 * ao bucket. Troca de imagem apaga a anterior; se a gravação falhar, apaga a que acabou de subir.
 * O banco confere de novo (só o admin, pasta da própria empresa, limites dos textos).
 */
export async function salvarTelaEntrada(dados: { frase: string; texto: string; imagemNova: string | null }): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const descartarNova = async () => {
    if (dados.imagemNova) await supabase.storage.from(BUCKET_TELA_ENTRADA).remove([dados.imagemNova]);
  };

  const campos = esquema.safeParse({ frase: normalizarTextoEntrada(dados.frase), texto: normalizarTextoEntrada(dados.texto) });
  if (!campos.success) {
    await descartarNova();
    return { ok: false, mensagem: campos.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (dados.imagemNova && !caminhoImagemEntradaValido(atual.empresaId, dados.imagemNova)) {
    return { ok: false, mensagem: "Imagem inválida. Escolha a foto de novo." };
  }

  const { data: anterior, error: erroLeitura } = await supabase
    .from("empresa_tela_entrada")
    .select("imagem_caminho")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  if (erroLeitura) {
    await descartarNova();
    return { ok: false, mensagem: mensagemErro(erroLeitura, "Não foi possível salvar.") };
  }

  const { error } = await supabase.from("empresa_tela_entrada").upsert(
    {
      empresa_id: atual.empresaId,
      frase: campos.data.frase,
      texto: campos.data.texto,
      imagem_caminho: dados.imagemNova ?? anterior?.imagem_caminho ?? null,
    },
    { onConflict: "empresa_id" },
  );
  if (error) {
    await descartarNova();
    return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  }
  // A foto antiga só sai depois que a nova está gravada; se a remoção falhar, sobra um arquivo sem uso.
  if (dados.imagemNova && anterior?.imagem_caminho && anterior.imagem_caminho !== dados.imagemNova) {
    await supabase.storage.from(BUCKET_TELA_ENTRADA).remove([anterior.imagem_caminho]);
  }

  revalidar();
  // A faixa pode usar a mesma foto do login: todas as telas mudam.
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Salvo. A equipe vê a nova tela no próximo acesso." };
}

/** "Voltar ao padrão": limpa a foto, a frase e o texto do login; a faixa (cartão próprio) fica como está. */
export async function voltarTelaEntradaAoPadrao(): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: anterior, error: erroLeitura } = await supabase.from("empresa_tela_entrada").select("imagem_caminho").eq("empresa_id", atual.empresaId).maybeSingle();
  if (erroLeitura) return { ok: false, mensagem: mensagemErro(erroLeitura, "Não foi possível voltar ao padrão.") };
  if (anterior) {
    const { error } = await supabase.from("empresa_tela_entrada").update({ imagem_caminho: null, frase: null, texto: null }).eq("empresa_id", atual.empresaId);
    if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível voltar ao padrão.") };
    if (anterior.imagem_caminho) await supabase.storage.from(BUCKET_TELA_ENTRADA).remove([anterior.imagem_caminho]);
  }

  revalidar();
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "A tela de entrada voltou ao padrão do Raion." };
}

/**
 * Faixa do topo de cada tela (assistente, passo 3): a mesma foto da tela de entrada (padrão) ou uma própria, já
 * enviada pelo navegador. Trocar a própria apaga a anterior; se a gravação falhar, apaga a que acabou de subir.
 */
export async function salvarFaixa(dados: { usaEntrada: boolean; imagemNova: string | null }): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const descartarNova = async () => {
    if (dados.imagemNova) await supabase.storage.from(BUCKET_TELA_ENTRADA).remove([dados.imagemNova]);
  };
  if (dados.imagemNova && !caminhoImagemEntradaValido(atual.empresaId, dados.imagemNova)) {
    return { ok: false, mensagem: "Imagem inválida. Escolha a foto de novo." };
  }
  const { data: anterior, error: erroLeitura } = await supabase.from("empresa_tela_entrada").select("faixa_caminho").eq("empresa_id", atual.empresaId).maybeSingle();
  if (erroLeitura) {
    await descartarNova();
    return { ok: false, mensagem: mensagemErro(erroLeitura, "Não foi possível salvar.") };
  }
  const faixa = dados.imagemNova ?? anterior?.faixa_caminho ?? null;
  if (!dados.usaEntrada && !faixa) return { ok: false, mensagem: "Escolha a foto da faixa, ou use a mesma da tela de entrada." };
  const { error } = await supabase
    .from("empresa_tela_entrada")
    .upsert({ empresa_id: atual.empresaId, faixa_usa_entrada: dados.usaEntrada, faixa_caminho: faixa }, { onConflict: "empresa_id" });
  if (error) {
    await descartarNova();
    return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  }
  if (dados.imagemNova && anterior?.faixa_caminho && anterior.faixa_caminho !== dados.imagemNova) {
    await supabase.storage.from(BUCKET_TELA_ENTRADA).remove([anterior.faixa_caminho]);
  }
  revalidar();
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Faixa salva. Aparece no topo de cada tela." };
}
