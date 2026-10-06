/**
 * Regras puras de imagem enviada ao Storage (sem dependência de DOM nem de servidor): usadas
 * pelo navegador (validação antes do editor, cálculo do recorte, caminho do arquivo) e pelo
 * servidor (conferência do caminho antes de gravar). Hoje atende as recompensas da gamificação.
 */

export const LIMITE_BYTES_IMAGEM = 3 * 1024 * 1024;
export const TIPOS_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoImagemAceito = (typeof TIPOS_IMAGEM_ACEITOS)[number];

/** Saída máxima do recorte: 1200x900 (4:3). Nunca amplia a imagem. */
export const SAIDA_MAXIMA_IMAGEM = { largura: 1200, altura: 900 } as const;

export const DICA_IMAGEM = "JPG, PNG ou WebP até 3 MB";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_EXATO = new RegExp(`^${UUID}$`, "i");

/** Mensagem de erro (em português) se o arquivo escolhido não for aceito; null se estiver ok. */
export function validarArquivoImagem(arquivo: { type: string; size: number }): string | null {
  if (!(TIPOS_IMAGEM_ACEITOS as readonly string[]).includes(arquivo.type)) {
    return "Formato não aceito. Use JPG, PNG ou WebP.";
  }
  if (arquivo.size > LIMITE_BYTES_IMAGEM) return "A imagem passa de 3 MB. Escolha um arquivo menor.";
  if (arquivo.size === 0) return "O arquivo está vazio.";
  return null;
}

/** Extensão do arquivo final conforme o tipo gerado pelo recorte. */
export function extensaoDoTipo(tipo: string): "webp" | "jpg" | "png" | null {
  if (tipo === "image/webp") return "webp";
  if (tipo === "image/jpeg") return "jpg";
  if (tipo === "image/png") return "png";
  return null;
}

/** Dimensões da saída: reduz mantendo a proporção até caber em `maximo`; nunca amplia. */
export function calcularDimensoesSaida(
  larguraRecorte: number,
  alturaRecorte: number,
  maximo: { largura: number; altura: number } = SAIDA_MAXIMA_IMAGEM,
): { largura: number; altura: number } {
  const escala = Math.min(1, maximo.largura / larguraRecorte, maximo.altura / alturaRecorte);
  return {
    largura: Math.max(1, Math.round(larguraRecorte * escala)),
    altura: Math.max(1, Math.round(alturaRecorte * escala)),
  };
}

/** Caminho no bucket: `<empresa_id>/<recompensa_id>/<uuid>.<ext>`. */
export function montarCaminhoImagemRecompensa(
  empresaId: string,
  recompensaId: string,
  extensao: string,
  arquivoId: string,
): string {
  return `${empresaId}/${recompensaId}/${arquivoId}.${extensao}`;
}

/**
 * Confere se `caminho` é um arquivo gerado pelo app dentro da pasta da recompensa da empresa:
 * `<empresa_id>/<recompensa_id>/<uuid>.(webp|jpg|jpeg|png)`, sem outras pastas nem `..`.
 */
export function caminhoImagemRecompensaValido(empresaId: string, recompensaId: string, caminho: string): boolean {
  if (!UUID_EXATO.test(empresaId) || !UUID_EXATO.test(recompensaId)) return false;
  const esperado = new RegExp(`^${empresaId}/${recompensaId}/${UUID}\.(webp|jpg|jpeg|png)$`, "i");
  return esperado.test(caminho);
}
