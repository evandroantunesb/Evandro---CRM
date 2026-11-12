"use client";

import { TIPOS_IMAGEM_ACEITOS } from "@/lib/imagem-upload";
import { recortarImagem } from "@/lib/recortar-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import {
  BUCKET_TELA_ENTRADA,
  LARGURA_MINIMA_IMAGEM_ENTRADA,
  LIMITE_BYTES_IMAGEM_ENTRADA,
  SAIDA_IMAGEM_ENTRADA,
  montarCaminhoImagemEntrada,
} from "@/lib/tela-entrada";

/*
 * Fotos do bucket público `tela-entrada` (tela de entrada e faixa do topo): conferir no navegador, reduzir até 2400 px
 * e enviar só ao salvar. Usado em Configurações › Tela de entrada e no assistente de primeiro acesso.
 */

export type FotoEscolhida = { arquivo: File; url: string; largura: number; altura: number };

function medir(url: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    img.src = url;
  });
}

/** Confere tipo, tamanho e largura mínima. A URL temporária devolvida precisa ser solta pelo chamador. */
export async function escolherFotoEntrada(arquivo: File): Promise<{ ok: true; foto: FotoEscolhida } | { ok: false; mensagem: string }> {
  if (!(TIPOS_IMAGEM_ACEITOS as readonly string[]).includes(arquivo.type)) return { ok: false, mensagem: "Use uma imagem JPG, PNG ou WebP." };
  if (arquivo.size > LIMITE_BYTES_IMAGEM_ENTRADA) return { ok: false, mensagem: "A imagem passa de 5 MB. Escolha uma menor." };
  const url = URL.createObjectURL(arquivo);
  try {
    const { largura, altura } = await medir(url);
    if (largura < LARGURA_MINIMA_IMAGEM_ENTRADA) {
      URL.revokeObjectURL(url);
      return {
        ok: false,
        mensagem: `A imagem tem ${largura} px de largura. Use uma com pelo menos ${LARGURA_MINIMA_IMAGEM_ENTRADA} px para não ficar borrada.`,
      };
    }
    return { ok: true, foto: { arquivo, url, largura, altura } };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, mensagem: "Não foi possível abrir a imagem. Tente outra." };
  }
}

/** Reduz e envia ao bucket; devolve o caminho, ou nulo se o envio falhar. */
export async function enviarFotoEntrada(empresaId: string, foto: FotoEscolhida): Promise<string | null> {
  const reduzida = await recortarImagem(foto.url, { x: 0, y: 0, width: foto.largura, height: foto.altura }, { saidaMaxima: SAIDA_IMAGEM_ENTRADA });
  const caminho = montarCaminhoImagemEntrada(empresaId, reduzida.extensao, crypto.randomUUID());
  const { error } = await criarClienteNavegador()
    .storage.from(BUCKET_TELA_ENTRADA)
    .upload(caminho, reduzida.blob, { contentType: reduzida.tipo, cacheControl: "31536000", upsert: false });
  return error ? null : caminho;
}

/** Apaga uma foto enviada que não chegou a ser gravada (falha de rede depois do envio). */
export async function descartarFotoEntrada(caminho: string): Promise<void> {
  await criarClienteNavegador().storage.from(BUCKET_TELA_ENTRADA).remove([caminho]);
}
