import type { ImagensDoPdf } from "./pdf-simples";

/**
 * Imagens da identidade da empresa que entram no PDF emitido (que é imutável: o que sair errado fica assim).
 *
 * - LOGO configurado que não carrega (arquivo ausente, vazio ou em formato que o PDF não suporta) = a emissão é
 *   RECUSADA, para nunca congelar uma proposta sem a marca da empresa. Sem logo configurado, a proposta usa o nome.
 * - FOTO da capa ausente ou que não carrega = fallback visual definido: fundo sólido na cor da identidade, com a faixa
 *   lateral e a barra de destaque (capa sem imagem; coberto por teste de PDF em 3 páginas).
 *
 * O arquivo precisa estar na pasta da própria empresa, e o download usa o acesso do usuário que emite (a política de
 * leitura da marca vale), não a service role. O PDF só entende PNG e JPEG; o arquivo é lido uma vez e embutido como data URI (nada é buscado na rede ao gerar).
 */

export type BaixarImagem = (caminho: string) => Promise<Uint8Array | null>;

export type ResultadoImagens = { ok: true; imagens: ImagensDoPdf; fotoUsouFallback: boolean } | { ok: false; mensagem: string };

export const MENSAGEM_LOGO_FALHOU =
  "Não foi possível carregar o logo da empresa (confira o arquivo em Configurações › Propostas › Identidade; use PNG ou JPEG). Nada foi emitido.";

/** Tipo pelo conteúdo do arquivo (não pelo nome nem pelo tipo informado no envio). */
function tipoDaImagem(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** O arquivo tem de estar na pasta da própria empresa (`<empresa_id>/...`), sem subir de diretório. */
export function caminhoDaEmpresa(caminho: string, empresaId: string): boolean {
  const prefixo = `${empresaId}/`;
  return caminho.startsWith(prefixo) && caminho.length > prefixo.length && !caminho.split("/").some((parte) => parte === ".." || parte === "." || parte === "");
}

async function comoDataUri(baixar: BaixarImagem, caminho: string, empresaId: string): Promise<string | null> {
  // Defesa em profundidade: o caminho vem de uma tabela que o admin escreve; objeto de OUTRA empresa nunca entra.
  if (!caminhoDaEmpresa(caminho, empresaId)) return null;
  try {
    const bytes = await baixar(caminho);
    if (!bytes || bytes.byteLength === 0) return null;
    const tipo = tipoDaImagem(bytes);
    if (!tipo) return null;
    return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function prepararImagensDaEmissao(
  baixar: BaixarImagem,
  caminhos: { logo: string | null | undefined; foto: string | null | undefined },
  empresaId: string,
): Promise<ResultadoImagens> {
  let logoUrl: string | null = null;
  if (caminhos.logo) {
    logoUrl = await comoDataUri(baixar, caminhos.logo, empresaId);
    if (!logoUrl) return { ok: false, mensagem: MENSAGEM_LOGO_FALHOU };
  }
  const fotoCapaUrl = caminhos.foto ? await comoDataUri(baixar, caminhos.foto, empresaId) : null;
  return { ok: true, imagens: { logoUrl, fotoCapaUrl }, fotoUsouFallback: fotoCapaUrl === null };
}
