import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { PropostaSimplesPdfDocument, type ImagensDoPdf } from "./pdf-simples";
import type { DadosEmissaoSimples } from "./proposta-simples";

export type ImagensDaEmissao = ImagensDoPdf;

/**
 * Gera o PDF da proposta simples a partir dos dados congelados. Chamada UMA vez, na emissão; depois disso o PDF
 * é lido do bucket, nunca renderizado de novo.
 */
export async function gerarPdfPropostaSimples(dados: DadosEmissaoSimples, imagens: ImagensDaEmissao): Promise<Uint8Array> {
  const buffer = await renderToBuffer(PropostaSimplesPdfDocument({ dados, imagens }));
  return new Uint8Array(buffer);
}
