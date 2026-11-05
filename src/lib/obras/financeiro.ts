import "server-only";
import { BUCKET_COMPROVANTES } from "@/lib/avisos-pagamento-regras";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { ehCategoriaCusto } from "./custos";
import { BUCKET_FINANCEIRO_OBRA, SITUACOES_CONTA, type ContaPagarVM, type SituacaoConta } from "./financeiro-regras";

/** Links assinados valem 10 minutos: a ficha é recarregada a cada visita. */
const EXPIRA_SEGUNDOS = 600;

export type PagamentoClienteVM = {
  situacao: "confirmado" | "estornado" | null;
  condicao: string | null;
  valor: number | null;
  confirmadoEm: string | null;
  confirmadoPor: string | null;
  comprovanteNome: string | null;
  comprovanteUrl: string | null;
};

export type NfClienteVM = { nome: string; url: string | null; anexadaEm: string };

export type FinanceiroObraVM = {
  contas: ContaPagarVM[];
  cliente: PagamentoClienteVM | null;
  /** Null para quem não vê a NF do cliente; `nf` nulo = ainda não anexada. */
  nfCliente: { nf: NfClienteVM | null } | null;
  /** Fornecedores já usados pela empresa (nas obras que a pessoa vê), para sugerir no lançamento. */
  fornecedores: string[];
};

export async function assinar(supabase: SupabaseServidor, bucket: string, caminhos: string[]): Promise<Map<string, string>> {
  if (!caminhos.length) return new Map();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(caminhos, EXPIRA_SEGUNDOS);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Colunas de `obra_contas_pagar` que viram `ContaPagarVM` (com `obra_id` para a tela Financeiro). */
export const COLUNAS_CONTA = "id, obra_id, fornecedor, categoria, descricao, valor, vencimento, situacao, pago_em, comprovante_caminho, comprovante_nome, nf_caminho, nf_nome, motivo";

type LinhaConta = {
  id: string;
  fornecedor: string;
  categoria: string;
  descricao: string | null;
  valor: number | string;
  vencimento: string;
  situacao: string;
  pago_em: string | null;
  comprovante_caminho: string | null;
  comprovante_nome: string | null;
  nf_caminho: string | null;
  nf_nome: string | null;
  motivo: string | null;
};

/** Descarta linha com categoria ou situação desconhecida (o app não saberia mostrar). */
export const contaValida = <T extends Pick<LinhaConta, "categoria" | "situacao">>(c: T) =>
  ehCategoriaCusto(c.categoria) && (SITUACOES_CONTA as readonly string[]).includes(c.situacao);

/** Caminhos de anexo a assinar. */
export const anexosDasContas = (linhas: readonly Pick<LinhaConta, "comprovante_caminho" | "nf_caminho">[]) =>
  linhas.flatMap((c) => [c.comprovante_caminho, c.nf_caminho]).filter((c): c is string => !!c);

export function contaDaLinha(c: LinhaConta, urls: Map<string, string>): ContaPagarVM {
  return {
    id: c.id,
    fornecedor: c.fornecedor,
    categoria: c.categoria as ContaPagarVM["categoria"],
    descricao: c.descricao,
    valor: Number(c.valor),
    vencimento: c.vencimento,
    situacao: c.situacao as SituacaoConta,
    pagoEm: c.pago_em,
    comprovanteNome: c.comprovante_nome,
    comprovanteUrl: c.comprovante_caminho ? (urls.get(c.comprovante_caminho) ?? null) : null,
    nfNome: c.nf_nome,
    nfUrl: c.nf_caminho ? (urls.get(c.nf_caminho) ?? null) : null,
    motivo: c.motivo,
  };
}

/**
 * Financeiro da obra para a ficha. A RLS decide: quem não vê os custos recebe tudo vazio (e `cliente` nulo); a NF do
 * cliente só chega a admin, gestor e Administrativo. `nomes` = identidade dos membros (id → nome).
 */
export async function carregarFinanceiroObra(
  supabase: SupabaseServidor,
  { empresaId, obraId, podeVerNfCliente, nomes }: { empresaId: string; obraId: string; podeVerNfCliente: boolean; nomes: Map<string, string> },
): Promise<FinanceiroObraVM> {
  const [contasRes, clienteRes, nfRes, fornecedoresRes] = await Promise.all([
    supabase
      .from("obra_contas_pagar")
      .select("id, fornecedor, categoria, descricao, valor, vencimento, situacao, pago_em, comprovante_caminho, comprovante_nome, nf_caminho, nf_nome, motivo")
      .eq("obra_id", obraId)
      .order("vencimento")
      .order("created_at"),
    supabase.rpc("pagamento_cliente_obra", { p_obra_id: obraId }),
    podeVerNfCliente ? supabase.from("obra_nf_cliente").select("caminho, nome, anexada_em").eq("obra_id", obraId).maybeSingle() : Promise.resolve(null),
    supabase.from("obra_contas_pagar").select("fornecedor").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(300),
  ]);
  for (const r of [contasRes, clienteRes, fornecedoresRes]) if (r.error) throw r.error;
  if (nfRes?.error) throw nfRes.error;

  const linhas = (contasRes.data ?? []).filter(contaValida);
  const caminhos = anexosDasContas(linhas);
  const linhaCliente = clienteRes.data?.[0] ?? null;
  const nf = nfRes?.data ?? null;
  const [urls, urlComprovanteCliente] = await Promise.all([
    assinar(supabase, BUCKET_FINANCEIRO_OBRA, [...caminhos, ...(nf ? [nf.caminho] : [])]),
    assinar(supabase, BUCKET_COMPROVANTES, linhaCliente?.comprovante_caminho ? [linhaCliente.comprovante_caminho] : []),
  ]);

  const contas: ContaPagarVM[] = linhas.map((c) => contaDaLinha(c, urls));

  const cliente: PagamentoClienteVM | null = linhaCliente
    ? {
        situacao: linhaCliente.situacao === "confirmado" || linhaCliente.situacao === "estornado" ? linhaCliente.situacao : null,
        condicao: linhaCliente.condicao,
        valor: linhaCliente.valor == null ? null : Number(linhaCliente.valor),
        confirmadoEm: linhaCliente.confirmado_em,
        confirmadoPor: linhaCliente.confirmado_por_membro_id ? (nomes.get(linhaCliente.confirmado_por_membro_id) ?? "Usuário não identificado") : null,
        comprovanteNome: linhaCliente.comprovante_nome,
        comprovanteUrl: linhaCliente.comprovante_caminho ? (urlComprovanteCliente.get(linhaCliente.comprovante_caminho) ?? null) : null,
      }
    : null;

  const fornecedores = [...new Set((fornecedoresRes.data ?? []).map((f) => f.fornecedor.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    contas,
    cliente,
    nfCliente: podeVerNfCliente ? { nf: nf ? { nome: nf.nome, url: urls.get(nf.caminho) ?? null, anexadaEm: nf.anexada_em } : null } : null,
    fornecedores,
  };
}
