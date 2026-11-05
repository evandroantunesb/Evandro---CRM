/**
 * Regras da tela Financeiro (desenho aprovado "Perfis · Administrativo › Financeiro"), sem dependência de servidor:
 * abas por perfil, indicadores, busca e quando a nota fiscal do cliente fica pendente. Dados: obra_contas_pagar,
 * obra_marcos e os pagamentos informados pelo vendedor (20261121100000_contas_pagar_obra.sql, 20261113100000).
 */
import { diasEntre, type ContaPagarVM } from "@/lib/obras/financeiro-regras";
import type { SituacaoObra } from "@/lib/obras/rotulos";

export const ABAS_FINANCEIRO = [
  { valor: "a-pagar", rotulo: "A pagar" },
  { valor: "confirmar", rotulo: "Pagamentos a confirmar" },
  { valor: "notas", rotulo: "Notas fiscais" },
  { valor: "pagos", rotulo: "Pagos" },
] as const;
export type AbaFinanceiro = (typeof ABAS_FINANCEIRO)[number]["valor"];

/** Conta a pagar com a obra a que pertence e se a pessoa pode agir sobre ela (Administrativo da obra, gestor ou admin). */
export type ContaFinanceiroVM = ContaPagarVM & { obraId: string; obraNumero: number | null; clienteNome: string | null; podeEscrever: boolean };

/** Obra com a instalação concluída e a nota fiscal do cliente ainda por anexar. */
export type NfClientePendenteVM = { obraId: string; obraNumero: number; clienteNome: string; podeEscrever: boolean };

/**
 * O que a pessoa vê. Admin e gestor: tudo. Operação: as quatro abas se atua no Administrativo; só "Pagamentos a
 * confirmar" se só confere pagamento (Operacional). Os demais papéis não entram.
 */
export function acessoFinanceiro({
  papel,
  atuaNoAdministrativo,
  confirmaPagamento,
}: {
  papel: string | null | undefined;
  atuaNoAdministrativo: boolean;
  confirmaPagamento: boolean;
}): { completo: boolean; confirmar: boolean } {
  if (papel === "admin" || papel === "gestor") return { completo: true, confirmar: true };
  if (papel === "operacao") return { completo: atuaNoAdministrativo, confirmar: confirmaPagamento || atuaNoAdministrativo };
  return { completo: false, confirmar: false };
}

export function abasVisiveis(acesso: { completo: boolean; confirmar: boolean }): AbaFinanceiro[] {
  if (acesso.completo) return ABAS_FINANCEIRO.map((a) => a.valor);
  return acesso.confirmar ? ["confirmar"] : [];
}

/** Aba pedida na URL, se a pessoa a vê; senão a primeira que ela vê. */
export function abaEscolhida(pedida: unknown, visiveis: readonly AbaFinanceiro[]): AbaFinanceiro | null {
  return visiveis.find((a) => a === pedida) ?? visiveis[0] ?? null;
}

const soma = (contas: readonly Pick<ContaPagarVM, "valor">[]) => Math.round(contas.reduce((s, c) => s + c.valor, 0) * 100) / 100;

/** Janela de "A pagar em 7 dias": vence de hoje até daqui a 7 dias. As vencidas têm indicador próprio. */
export const DIAS_PROXIMOS = 7;

export function kpisFinanceiro({
  abertas,
  hoje,
  aConfirmar,
  nfFornecedor,
  nfCliente,
}: {
  abertas: readonly Pick<ContaPagarVM, "situacao" | "vencimento" | "valor">[];
  hoje: string;
  aConfirmar: number;
  nfFornecedor: number;
  nfCliente: number;
}) {
  const aPagar = abertas.filter((c) => c.situacao === "a_pagar");
  const proximas = aPagar.filter((c) => c.vencimento >= hoje && diasEntre(hoje, c.vencimento) <= DIAS_PROXIMOS);
  const vencidas = aPagar.filter((c) => c.vencimento < hoje);
  return {
    proximos: { valor: soma(proximas), quantidade: proximas.length },
    vencidos: { valor: soma(vencidas), quantidade: vencidas.length },
    aConfirmar,
    notas: { total: nfFornecedor + nfCliente, fornecedor: nfFornecedor, cliente: nfCliente },
  };
}

/** Prazo da conta na tabela "A pagar", pelo desenho: "Vencido há 1 dia", "Vence hoje", "Em 3 dias". */
export function prazoConta(vencimento: string, hoje: string): { rotulo: string; vencido: boolean } {
  const faltam = diasEntre(hoje, vencimento);
  const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  if (faltam < 0) return { rotulo: `Vencido há ${dias(-faltam)}`, vencido: true };
  if (faltam === 0) return { rotulo: "Vence hoje", vencido: false };
  return { rotulo: `Em ${dias(faltam)}`, vencido: false };
}

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Busca por fornecedor, cliente ou obra (nome ou número, com ou sem "#"). Sem termo, devolve tudo. */
export function filtrarPorBusca<T extends { fornecedor?: string; descricao?: string | null; clienteNome: string | null; obraNumero: number | null }>(
  itens: readonly T[],
  busca: string,
): T[] {
  const termo = normalizar(busca.trim()).replace(/^#/, "");
  if (!termo) return [...itens];
  return itens.filter((i) =>
    normalizar([i.fornecedor, i.descricao, i.clienteNome, i.obraNumero != null ? String(i.obraNumero) : null].filter(Boolean).join(" ")).includes(termo),
  );
}

/** Status do Operacional a partir dos quais a nota do cliente pode ser emitida (a tarefa automática nasce aí). */
const OPERACIONAL_INSTALADO = ["instalacao_concluida", "concluido"];

/** A nota fiscal do cliente está pendente: marco pendente, obra não cancelada e instalação concluída. */
export function nfClientePendente({
  situacaoObra,
  statusOperacional,
  statusMarco,
}: {
  situacaoObra: SituacaoObra;
  statusOperacional: string | null;
  statusMarco: string | null;
}): boolean {
  return statusMarco === "pendente" && situacaoObra !== "cancelada" && statusOperacional != null && OPERACIONAL_INSTALADO.includes(statusOperacional);
}

/** "Marcos Pereira · #998" (a obra pode faltar na lista de quem não a vê mais; aí só o número, se houver). */
export function rotuloObra(o: { clienteNome: string | null; obraNumero: number | null }): string {
  return [o.clienteNome, o.obraNumero != null ? `#${o.obraNumero}` : null].filter(Boolean).join(" · ") || "Obra";
}
