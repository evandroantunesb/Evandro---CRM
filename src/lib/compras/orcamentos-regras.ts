import { nomeSeguro } from "@/lib/anexos-regras";
import type { ModalidadeFrete } from "./regras";

/**
 * Regras puras dos orçamentos e arquivos de compra da obra (20261126100000_compras_orcamentos.sql). O banco decide de
 * novo tudo o que grava; aqui é só envio de arquivo, leitura e selos dos cartões.
 */

/** Bucket privado, pasta `empresa/obra/arquivo` (as políticas exigem esse formato). */
export const BUCKET_COMPRAS_OBRA = "compras-obra";
/** Mesmo limite do bucket. */
export const LIMITE_ARQUIVO_COMPRAS = 10 * 1024 * 1024;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Tipos aceitos pelo bucket. */
export const TIPOS_ARQUIVO_COMPRAS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", XLSX, "text/csv"];
/** Para o seletor de arquivo: os tipos e as extensões (planilha às vezes chega sem tipo ou com o tipo do Excel). */
export const ACEITA_ARQUIVO_COMPRAS = [...TIPOS_ARQUIVO_COMPRAS, ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".xlsx", ".csv"].join(",");

/**
 * Tipo que vai ao Storage. Planilhas pela extensão: no Windows o navegador manda o .csv como `application/vnd.ms-excel`
 * (ou sem tipo), e o bucket recusaria.
 */
export function tipoArquivoCompras(nome: string, tipoMime: string): string | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return XLSX;
  return TIPOS_ARQUIVO_COMPRAS.includes(tipoMime) ? tipoMime : null;
}

/** Motivo para recusar o arquivo antes de enviar, ou null se está ok. */
export function problemaArquivoCompras(a: { nome: string; tamanho: number; tipoMime: string }): string | null {
  if (a.tamanho <= 0) return `"${a.nome}" está vazio.`;
  if (a.tamanho > LIMITE_ARQUIVO_COMPRAS) return `"${a.nome}" passa de 10 MB.`;
  if (!tipoArquivoCompras(a.nome, a.tipoMime)) return "Envie um PDF, uma imagem ou uma planilha (.xlsx ou .csv).";
  return null;
}

export const caminhoCompras = (empresaId: string, obraId: string, nome: string) => `${empresaId}/${obraId}/${nomeSeguro(nome)}`;

export const COBERTURAS = ["kit_completo", "parte"] as const;
export type Cobertura = (typeof COBERTURAS)[number];
export const ROTULO_COBERTURA: Record<Cobertura, string> = { kit_completo: "Kit completo", parte: "Parte do kit" };

export type OrcamentoVM = {
  id: string;
  fornecedor: string;
  valorTotal: number;
  freteModalidade: ModalidadeFrete;
  /** Só em FOB (em CIF, zero). */
  frete: number;
  cobertura: Cobertura;
  itensDescricao: string | null;
  entregaPrevista: string;
  validoAte: string;
  condicaoPagamento: string | null;
  observacao: string | null;
  arquivo: { nome: string; url: string | null };
  /** Pedido ativo gerado deste orçamento (cancelado = orçamento livre de novo). */
  pedido: { id: string; numero: number; criadoEm: string } | null;
  descartado: boolean;
  motivoDescarte: string | null;
  criadoEm: string;
};

/** "pedido" = o PDF gerado pelo Raion (não é arquivo guardado; aparece na lista com o link de geração). */
export const TIPOS_ARQUIVO = ["orcamento", "confirmacao", "outro", "documento_cliente", "pedido"] as const;
export type TipoArquivoCompra = (typeof TIPOS_ARQUIVO)[number];
export const ROTULO_TIPO_ARQUIVO: Record<TipoArquivoCompra, string> = {
  orcamento: "Orçamento",
  confirmacao: "Confirmação",
  outro: "Outro",
  documento_cliente: "Documento do cliente",
  pedido: "Pedido",
};

export type ArquivoCompraVM = {
  id: string;
  tipo: TipoArquivoCompra;
  /** Documento do cliente anexado por Compras (`documento_foto`, `comprovante_residencia`, `cartao_cnpj` ou `outro`). */
  documento: string | null;
  /** Em "outro documento": o que é. */
  descricao: string | null;
  /** Do orçamento, do pedido ou o informado em "Outro". */
  fornecedor: string | null;
  pedidoNumero: number | null;
  nome: string;
  url: string | null;
  enviadoPor: string | null;
  enviadoEm: string;
  /** Orçamento descartado: o arquivo continua na lista, marcado. */
  descartado: boolean;
};

export type SeloOrcamento = "escolhido" | "mais_rapida" | "parcial" | "vencido";
export const ROTULO_SELO_ORCAMENTO: Record<SeloOrcamento, string> = {
  escolhido: "Escolhido",
  mais_rapida: "Entrega mais rápida",
  parcial: "Parcial",
  vencido: "Vencido",
};

/**
 * Selos de cada orçamento em comparação (os descartados ficam de fora). "Entrega mais rápida": a menor entrega entre os
 * de kit completo ainda livres e na validade, só quando há mais de um e ela não empata com outro.
 */
export function selosOrcamentos(orcamentos: readonly OrcamentoVM[], hoje: string): Map<string, SeloOrcamento[]> {
  const ativos = orcamentos.filter((o) => !o.descartado);
  const vencido = (o: OrcamentoVM) => !o.pedido && o.validoAte < hoje;
  const candidatos = ativos.filter((o) => !o.pedido && !vencido(o) && o.cobertura === "kit_completo");
  const menor = candidatos.length > 1 ? candidatos.reduce((m, o) => (o.entregaPrevista < m ? o.entregaPrevista : m), candidatos[0].entregaPrevista) : null;
  const maisRapido = menor && candidatos.filter((o) => o.entregaPrevista === menor).length === 1 ? candidatos.find((o) => o.entregaPrevista === menor)!.id : null;
  return new Map(
    ativos.map((o) => {
      const selos: SeloOrcamento[] = [];
      if (o.pedido) selos.push("escolhido");
      if (o.id === maisRapido) selos.push("mais_rapida");
      if (o.cobertura === "parte") selos.push("parcial");
      if (vencido(o)) selos.push("vencido");
      return [o.id, selos];
    }),
  );
}

/** Pode editar ou descartar: não descartado e sem pedido ativo. */
export const orcamentoLivre = (o: Pick<OrcamentoVM, "descartado" | "pedido">) => !o.descartado && !o.pedido;
