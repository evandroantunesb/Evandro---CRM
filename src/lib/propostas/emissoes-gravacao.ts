import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemErro } from "@/lib/erros";
import type { Database } from "@/lib/supabase/database.types";
import { gerarPdfPropostaSimples, type ImagensDaEmissao } from "./emissao-simples-pdf";
import { buscarEmissaoPorToken, inserirEmissao, type EmissaoRow } from "./emissoes-dados";
import { hashDosDados, lerDadosDaEmissao, RENDERIZADOR_SIMPLES, sha256Hex, type DadosEmissaoSimples } from "./proposta-simples";

export const BUCKET_EMISSOES = "propostas-emitidas";

type Cliente = SupabaseClient<Database>;

export type ResultadoGravacao = { ok: true; id: string; versao: number } | { ok: false; mensagem: string };

/**
 * Gera o PDF UMA vez a partir dos dados congelados, guarda no bucket privado (service role) e grava a linha imutável
 * com o cliente do USUÁRIO (a RLS decide). Falha em qualquer passo = nada emitido; PDF sem linha é removido.
 */
export async function gravarEmissaoSimples(args: {
  /** Cliente do usuário (RLS): insere a linha. */
  supabase: Cliente;
  /** Service role: só envia/remove o PDF no bucket privado. */
  admin: Cliente;
  empresaId: string;
  negocioId: string;
  membroId: string;
  dados: DadosEmissaoSimples;
  imagens: ImagensDaEmissao;
}): Promise<ResultadoGravacao> {
  const { supabase, admin, empresaId, negocioId, membroId, dados, imagens } = args;

  let pdf: Uint8Array;
  try {
    pdf = await gerarPdfPropostaSimples(dados, imagens);
  } catch {
    return { ok: false, mensagem: "Não foi possível gerar o PDF da proposta. Nada foi emitido." };
  }

  const id = randomUUID();
  const caminho = `${empresaId}/${negocioId}/${id}.pdf`;
  const envio = await admin.storage.from(BUCKET_EMISSOES).upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
  if (envio.error) return { ok: false, mensagem: "Não foi possível guardar o PDF da proposta. Nada foi emitido." };

  const { erro } = await inserirEmissao(supabase, {
    id,
    empresa_id: empresaId,
    negocio_id: negocioId,
    versao: dados.emissao.versao,
    dados,
    dados_sha256: hashDosDados(dados),
    validade_ate: dados.comercial.validadeAte,
    pdf_caminho: caminho,
    pdf_sha256: sha256Hex(pdf),
    pdf_bytes: pdf.byteLength,
    renderizador: RENDERIZADOR_SIMPLES,
    emitida_em: dados.emissao.emitidaEm,
    emitida_por: membroId,
  });
  if (erro) {
    // PDF sem linha não tem link e não aparece em lugar nenhum; remove para não deixar órfão.
    await admin.storage.from(BUCKET_EMISSOES).remove([caminho]);
    if (erro.code === "23505") return { ok: false, mensagem: "Outra proposta foi emitida ao mesmo tempo. Tente de novo." };
    return { ok: false, mensagem: mensagemErro(erro, "Não foi possível emitir a proposta. Nada foi emitido.") };
  }
  return { ok: true, id, versao: dados.emissao.versao };
}

export type LeituraDaEmissao =
  | { ok: true; emissao: EmissaoRow; dados: DadosEmissaoSimples; pdf: Uint8Array }
  | { ok: false; motivo: "inexistente" | "integridade" };

/**
 * Leitura pública pelo token: devolve os bytes GRAVADOS (nunca renderiza de novo) depois de conferir o formato e o
 * hash dos dados, o tamanho e o SHA-256 do PDF. Qualquer divergência = "integridade".
 */
export async function lerEmissaoPorToken(admin: Cliente, token: string): Promise<LeituraDaEmissao> {
  const { emissao } = await buscarEmissaoPorToken(admin, token);
  if (!emissao) return { ok: false, motivo: "inexistente" };
  const lida = lerDadosDaEmissao(emissao.dados, emissao.dados_sha256);
  if (!lida.ok) return { ok: false, motivo: "integridade" };
  const arquivo = await admin.storage.from(BUCKET_EMISSOES).download(emissao.pdf_caminho);
  if (!arquivo.data) return { ok: false, motivo: "integridade" };
  const pdf = new Uint8Array(await arquivo.data.arrayBuffer());
  if (pdf.byteLength !== emissao.pdf_bytes || sha256Hex(pdf) !== emissao.pdf_sha256) return { ok: false, motivo: "integridade" };
  return { ok: true, emissao, dados: lida.dados, pdf };
}
