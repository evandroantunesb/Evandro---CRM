/** Regras do comprovante de pagamento usadas no navegador e no servidor (sem dependência de servidor). */

/** Bucket privado do comprovante, pasta `empresa/contrato/objeto` (20261113100000_aviso_pagamento_vendedor.sql). */
export const BUCKET_COMPROVANTES = "comprovantes-pagamento";
/** Mesmo limite e tipos do bucket. */
export const LIMITE_COMPROVANTE = 10 * 1024 * 1024;
export const TIPOS_COMPROVANTE = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Motivo para recusar o comprovante antes de enviar, ou null se está ok. */
export function problemaComprovante(a: { nome: string; tamanho: number; tipoMime: string }): string | null {
  if (a.tamanho <= 0) return `"${a.nome}" está vazio.`;
  if (a.tamanho > LIMITE_COMPROVANTE) return `"${a.nome}" passa de 10 MB.`;
  if (!TIPOS_COMPROVANTE.includes(a.tipoMime)) return "O comprovante precisa ser uma foto ou um PDF.";
  return null;
}

export const pastaComprovante = (empresaId: string, contratoId: string) => `${empresaId}/${contratoId}`;

export type SituacaoAviso = "aberto" | "confirmado" | "devolvido" | "cancelado";

export type AvisoPagamentoVM = {
  id: string;
  situacao: SituacaoAviso;
  dataPagamento: string;
  observacao: string | null;
  comprovanteNome: string;
  comprovanteUrl: string | null;
  informadoPor: string;
  informadoEm: string;
  souQuemInformou: boolean;
  encerradoPor: string | null;
  encerradoEm: string | null;
  motivoDevolucao: string | null;
};

export type PagamentoAConfirmarVM = {
  avisoId: string;
  contratoId: string;
  negocioId: string;
  negocioNumero: number;
  cliente: string;
  cidade: string | null;
  valor: number | null;
  condicao: string | null;
  dataPagamento: string;
  observacao: string | null;
  comprovanteNome: string;
  comprovanteUrl: string | null;
  informadoPor: string;
  informadoEm: string;
};
