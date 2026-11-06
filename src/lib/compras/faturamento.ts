/**
 * Dados de faturamento do pedido (20261127100000_compras_pdf_documentos.sql): o cliente da obra (por
 * `dados_faturamento_obra`, só para quem escreve em Compras nela) e a própria empresa (nome e CNPJ).
 */

export type ClienteFaturamentoVM = {
  nome: string;
  pj: boolean;
  documento: string | null;
  inscricaoEstadual: string | null;
  rg: string | null;
  dataNascimento: string | null;
  email: string | null;
  telefone: string | null;
  /** Endereço completo numa linha (rua, número, complemento, bairro, cidade/UF e CEP). */
  endereco: string | null;
};

export type FaturamentoPedidoVM = {
  /** Nulo para quem não escreve em Compras na obra. */
  cliente: ClienteFaturamentoVM | null;
  empresa: { nome: string; cnpj: string | null };
};

type LinhaFaturamento = {
  nome: string | null;
  tipo: string | null;
  documento: string | null;
  inscricao_estadual: string | null;
  rg: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
};

const limpo = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const cepFormatado = (cep: string | null) => (cep && /^\d{8}$/.test(cep) ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : limpo(cep));

/** Endereço numa linha a partir dos campos do cadastro; sem eles, o texto único antigo (`endereco`). */
export function enderecoCompleto(l: Pick<LinhaFaturamento, "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep" | "endereco">): string | null {
  const rua = [limpo(l.logradouro), limpo(l.numero)].filter(Boolean).join(", ");
  if (!rua) return limpo(l.endereco);
  const cidade = [limpo(l.cidade), limpo(l.uf)].filter(Boolean).join("/");
  return [rua, limpo(l.complemento), limpo(l.bairro), cidade, cepFormatado(l.cep)].filter(Boolean).join(" · ");
}

export function clienteFaturamento(l: LinhaFaturamento | null | undefined): ClienteFaturamentoVM | null {
  if (!l) return null;
  return {
    nome: limpo(l.nome) ?? "Cliente",
    pj: l.tipo === "pj",
    documento: limpo(l.documento),
    inscricaoEstadual: limpo(l.inscricao_estadual),
    rg: limpo(l.rg),
    dataNascimento: limpo(l.data_nascimento),
    email: limpo(l.email),
    telefone: limpo(l.telefone),
    endereco: enderecoCompleto(l),
  };
}
