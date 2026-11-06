/**
 * Documentos do cliente (20261127100000_compras_pdf_documentos.sql): o vendedor anexa no negócio para gerar o
 * contrato, e Compras usa para faturar o kit no nome do cliente. Mesma regra de `pendencias_documentos_contrato` no
 * banco (que confere de novo ao gerar o contrato).
 */

export const DOCUMENTOS_CLIENTE = ["documento_foto", "comprovante_residencia", "cartao_cnpj"] as const;
export type DocumentoCliente = (typeof DOCUMENTOS_CLIENTE)[number];

export const ehDocumentoCliente = (v: string | null | undefined): v is DocumentoCliente => (DOCUMENTOS_CLIENTE as readonly string[]).includes(v ?? "");

/** Documento do negócio que a Engenharia recusou na obra (20261128100000_documentos_cliente_engenharia_administrativo.sql). */
export type RecusaDocumento = { documento: DocumentoCliente; anexoId: string; motivo: string | null; recusadoPor: string | null; recusadoEm: string | null };

/**
 * Recusas que ainda valem: o anexo recusado continua o mais recente da categoria no negócio. Anexado outro, a recusa
 * deixa de aparecer (a Engenharia vê o arquivo novo no item da obra). `anexos` vem do mais novo para o mais antigo.
 */
export function recusasAtivas(anexos: readonly { id: string; categoria: string }[], recusas: readonly RecusaDocumento[]): Map<DocumentoCliente, RecusaDocumento> {
  const ativas = new Map<DocumentoCliente, RecusaDocumento>();
  for (const r of recusas) {
    const atual = anexos.find((a) => a.categoria === CATEGORIA_DO_DOCUMENTO[r.documento]);
    if (atual?.id === r.anexoId) ativas.set(r.documento, r);
  }
  return ativas;
}

export const ROTULO_DOCUMENTO_CLIENTE: Record<DocumentoCliente, string> = {
  documento_foto: "Documento com foto",
  comprovante_residencia: "Comprovante de residência",
  cartao_cnpj: "Cartão CNPJ",
};

export const DICA_DOCUMENTO_CLIENTE: Record<DocumentoCliente, string> = {
  documento_foto: "CNH (ou RG) do titular",
  comprovante_residencia: "Fatura de energia recente",
  cartao_cnpj: "Cliente empresa (CNPJ)",
};

/** Categoria do anexo do negócio que guarda cada documento. */
export const CATEGORIA_DO_DOCUMENTO = {
  documento_foto: "cnh",
  comprovante_residencia: "fatura_gerador",
  cartao_cnpj: "cartao_cnpj",
} as const satisfies Record<DocumentoCliente, string>;

/** Rótulo da pendência (o mesmo texto que o banco usa na recusa). */
const PENDENCIA: Record<DocumentoCliente, string> = {
  documento_foto: "documento com foto",
  comprovante_residencia: "comprovante de residência (fatura de energia)",
  cartao_cnpj: "cartão CNPJ",
};

/** Documentos que o contrato exige: CPF, documento com foto e comprovante; CNPJ, cartão CNPJ e comprovante. */
export const documentosExigidos = (tipoCliente: string | null | undefined): DocumentoCliente[] =>
  tipoCliente === "pj" ? ["cartao_cnpj", "comprovante_residencia"] : ["documento_foto", "comprovante_residencia"];

export function pendenciasDocumentosContrato(categoriasAnexadas: Iterable<string>, tipoCliente: string | null | undefined): string[] {
  const tem = new Set(categoriasAnexadas);
  return documentosExigidos(tipoCliente)
    .filter((d) => !tem.has(CATEGORIA_DO_DOCUMENTO[d]))
    .map((d) => PENDENCIA[d]);
}

export const mensagemPendenciasDocumentos = (pendencias: string[]) => `Para gerar o contrato, anexe os documentos do cliente: ${pendencias.join(", ")}.`;
