/**
 * Regras do financeiro da obra (contas a pagar a fornecedores e nota fiscal do cliente), usadas no navegador e no
 * servidor, sem dependência de servidor. Banco: 20261121100000_contas_pagar_obra.sql.
 */
import { nomeSeguro } from "@/lib/anexos-regras";
import { ROTULO_CATEGORIA_CUSTO, type CategoriaCustoObra } from "./custos";

/** Bucket privado, pasta `empresa/obra/fornecedor|cliente/arquivo` (as políticas exigem esse formato). */
export const BUCKET_FINANCEIRO_OBRA = "financeiro-obra";
/** Mesmo limite e tipos do bucket. */
export const LIMITE_ANEXO_FINANCEIRO = 10 * 1024 * 1024;
export const TIPOS_ANEXO_FINANCEIRO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf", "text/xml", "application/xml"];

/** Motivo para recusar o arquivo antes de enviar, ou null se está ok. */
export function problemaAnexoFinanceiro(a: { nome: string; tamanho: number; tipoMime: string }): string | null {
  if (a.tamanho <= 0) return `"${a.nome}" está vazio.`;
  if (a.tamanho > LIMITE_ANEXO_FINANCEIRO) return `"${a.nome}" passa de 10 MB.`;
  if (!TIPOS_ANEXO_FINANCEIRO.includes(a.tipoMime)) return "Envie uma foto, um PDF ou o XML da nota.";
  return null;
}

export const caminhoFinanceiro = (empresaId: string, obraId: string, tipo: "fornecedor" | "cliente", nome: string) =>
  `${empresaId}/${obraId}/${tipo}/${nomeSeguro(nome)}`;

export const SITUACOES_CONTA = ["a_pagar", "paga", "cancelada", "estornada"] as const;
export type SituacaoConta = (typeof SITUACOES_CONTA)[number];

export type ContaPagarVM = {
  id: string;
  fornecedor: string;
  categoria: CategoriaCustoObra;
  descricao: string | null;
  valor: number;
  vencimento: string;
  situacao: SituacaoConta;
  pagoEm: string | null;
  comprovanteNome: string | null;
  comprovanteUrl: string | null;
  nfNome: string | null;
  nfUrl: string | null;
  motivo: string | null;
};

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Dias corridos de `de` até `ate` (datas ISO, sem fuso). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Selo da situação, pelo desenho: "Pago 18/10", "Vencido há 1 dia", "A pagar · em 3 dias", "Cancelada", "Estornada". */
export function situacaoConta(c: Pick<ContaPagarVM, "situacao" | "vencimento" | "pagoEm">, hoje: string): { rotulo: string; tom: "pago" | "vencido" | "aberto" | "encerrado" } {
  if (c.situacao === "paga") return { rotulo: `Pago ${dataBr(c.pagoEm ?? c.vencimento)}`, tom: "pago" };
  if (c.situacao === "cancelada") return { rotulo: "Cancelada", tom: "encerrado" };
  if (c.situacao === "estornada") return { rotulo: "Estornada", tom: "encerrado" };
  const faltam = diasEntre(hoje, c.vencimento);
  if (faltam < 0) return { rotulo: `Vencido há ${dias(-faltam)}`, tom: "vencido" };
  if (faltam === 0) return { rotulo: "A pagar · vence hoje", tom: "aberto" };
  return { rotulo: `A pagar · em ${dias(faltam)}`, tom: "aberto" };
}

export const contaVencida = (c: Pick<ContaPagarVM, "situacao" | "vencimento">, hoje: string) => c.situacao === "a_pagar" && c.vencimento < hoje;

/** Totais do cartão: só contas ativas (a pagar e pagas); canceladas e estornadas ficam fora. */
export function resumoContas(contas: readonly ContaPagarVM[], hoje: string) {
  const ativas = contas.filter((c) => c.situacao === "a_pagar" || c.situacao === "paga");
  const soma = (lista: readonly ContaPagarVM[]) => Math.round(lista.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  const pagas = ativas.filter((c) => c.situacao === "paga");
  const abertas = ativas.filter((c) => c.situacao === "a_pagar");
  return {
    total: ativas.length,
    pagas: pagas.length,
    pago: soma(pagas),
    aPagar: soma(abertas),
    vencidas: abertas.filter((c) => contaVencida(c, hoje)).length,
    nfPendentes: pagas.filter((c) => !c.nfNome).length,
  };
}

export const rotuloCategoria = (c: CategoriaCustoObra) => ROTULO_CATEGORIA_CUSTO[c];
