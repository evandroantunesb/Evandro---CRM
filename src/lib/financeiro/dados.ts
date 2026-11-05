import "server-only";
import type { PagamentoAConfirmarVM } from "@/lib/avisos-pagamento-regras";
import { carregarPagamentosAConfirmar } from "@/lib/avisos-pagamento";
import { carregarObras, type ObraListaVM } from "@/lib/obras/dados";
import { COLUNAS_CONTA, anexosDasContas, assinar, contaDaLinha, contaValida } from "@/lib/obras/financeiro";
import { BUCKET_FINANCEIRO_OBRA } from "@/lib/obras/financeiro-regras";
import { autorizacaoSetor, type SetorDoMembro } from "@/lib/obras/gestao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { nfClientePendente, rotuloObra, type ContaFinanceiroVM, type NfClientePendenteVM } from "./regras";

/**
 * Dados da tela Financeiro. A RLS decide o que cada pessoa lê (`pode_ver_custos_obra`: admin, gestor que vê a obra,
 * Administrativo e Operacional da obra); aqui só se junta a obra e se marca onde a pessoa pode escrever, com a mesma
 * regra de `autorizacao_setor_obra` (o banco confere de novo em cada RPC).
 */

/** Pagos mais recentes na aba "Pagos" (a lista não pagina). */
export const LIMITE_PAGOS = 200;
/** Teto das demais consultas: abaixo do limite de linhas do PostgREST. */
const LIMITE_LINHAS = 1000;

export type FinanceiroVM = {
  abertas: ContaFinanceiroVM[];
  pagas: ContaFinanceiroVM[];
  nfFornecedor: ContaFinanceiroVM[];
  nfCliente: NfClientePendenteVM[];
  pagamentosAConfirmar: PagamentoAConfirmarVM[];
  /** Obras em que a pessoa pode lançar conta (as mesmas da ficha: não canceladas, Administrativo da obra ou admin). */
  obrasParaLancar: { id: string; rotulo: string }[];
  fornecedores: string[];
};

const VAZIO: FinanceiroVM = { abertas: [], pagas: [], nfFornecedor: [], nfCliente: [], pagamentosAConfirmar: [], obrasParaLancar: [], fornecedores: [] };

/** Setores do membro e obras em que participa do Administrativo (só o papel `operacao` precisa). */
async function minhaAtuacao(supabase: SupabaseServidor, empresaId: string, membroId: string) {
  const [setoresRes, participacoesRes] = await Promise.all([
    supabase.from("membro_setores_obra").select("setor, capacidade").eq("empresa_id", empresaId).eq("membro_id", membroId),
    supabase.from("obra_participantes").select("obra_id").eq("empresa_id", empresaId).eq("membro_id", membroId).eq("setor", "administrativo").is("fim", null),
  ]);
  for (const r of [setoresRes, participacoesRes]) if (r.error) throw r.error;
  return {
    setores: (setoresRes.data ?? []) as SetorDoMembro[],
    obrasParticipando: new Set((participacoesRes.data ?? []).map((p) => p.obra_id)),
  };
}

/** A pessoa atua no setor Administrativo da empresa (qualquer capacidade). */
export async function atuaNoAdministrativo(supabase: SupabaseServidor, empresaId: string, membroId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("membro_setores_obra")
    .select("setor")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .eq("setor", "administrativo")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function carregarFinanceiro(
  supabase: SupabaseServidor,
  {
    empresaId,
    papel,
    membroId,
    completo,
    confirmar,
  }: { empresaId: string; papel: string; membroId: string; completo: boolean; confirmar: boolean },
): Promise<FinanceiroVM> {
  const pagamentosAConfirmar = confirmar ? await carregarPagamentosAConfirmar(supabase, empresaId) : [];
  if (!completo) return { ...VAZIO, pagamentosAConfirmar };

  const contas = () => supabase.from("obra_contas_pagar").select(COLUNAS_CONTA).eq("empresa_id", empresaId);
  const [{ obras }, atuacao, abertasRes, pagasRes, semNfRes, marcosRes] = await Promise.all([
    carregarObras(supabase, { empresaId, papel, comResponsaveis: false }),
    papel === "operacao" ? minhaAtuacao(supabase, empresaId, membroId) : Promise.resolve({ setores: [], obrasParticipando: new Set<string>() }),
    contas().eq("situacao", "a_pagar").order("vencimento").order("created_at").limit(LIMITE_LINHAS),
    contas().eq("situacao", "paga").order("pago_em", { ascending: false }).order("created_at", { ascending: false }).limit(LIMITE_PAGOS),
    contas().eq("situacao", "paga").is("nf_caminho", null).order("pago_em").limit(LIMITE_LINHAS),
    supabase.from("obra_marcos").select("obra_id, status").eq("empresa_id", empresaId).eq("marco", "nf_cliente").eq("status", "pendente").limit(LIMITE_LINHAS),
  ]);
  for (const r of [abertasRes, pagasRes, semNfRes, marcosRes]) if (r.error) throw r.error;

  const porId = new Map<string, ObraListaVM>(obras.map((o) => [o.id, o]));
  const podeEscrever = (obraId: string) => {
    const obra = porId.get(obraId);
    if (!obra || obra.situacao === "cancelada") return false;
    const entrada = { papel, setoresDoMembro: atuacao.setores, setoresParticipando: atuacao.obrasParticipando.has(obraId) ? ["administrativo"] : [] };
    return autorizacaoSetor(entrada, "administrativo") != null;
  };

  const abertasLinhas = (abertasRes.data ?? []).filter(contaValida);
  const pagasLinhas = (pagasRes.data ?? []).filter(contaValida);
  const semNfLinhas = (semNfRes.data ?? []).filter(contaValida);
  const urls = await assinar(supabase, BUCKET_FINANCEIRO_OBRA, [...new Set(anexosDasContas([...pagasLinhas, ...semNfLinhas]))]);

  const comObra = (linha: (typeof abertasLinhas)[number]): ContaFinanceiroVM => {
    const obra = porId.get(linha.obra_id);
    return {
      ...contaDaLinha(linha, urls),
      obraId: linha.obra_id,
      obraNumero: obra?.numero ?? null,
      clienteNome: obra?.clienteNome ?? null,
      podeEscrever: podeEscrever(linha.obra_id),
    };
  };

  const nfCliente = (marcosRes.data ?? []).flatMap((m): NfClientePendenteVM[] => {
    const obra = porId.get(m.obra_id);
    if (!obra) return [];
    const operacional = obra.setores.find((s) => s.setor === "operacional")?.status ?? null;
    if (!nfClientePendente({ situacaoObra: obra.situacao, statusOperacional: operacional, statusMarco: m.status })) return [];
    return [{ obraId: obra.id, obraNumero: obra.numero, clienteNome: obra.clienteNome, podeEscrever: podeEscrever(obra.id) }];
  });
  nfCliente.sort((a, b) => a.obraNumero - b.obraNumero);

  const fornecedores = [...new Set([...abertasLinhas, ...pagasLinhas].map((c) => c.fornecedor.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const obrasParaLancar = obras
    .filter((o) => podeEscrever(o.id))
    .map((o) => ({ id: o.id, rotulo: rotuloObra({ clienteNome: o.clienteNome, obraNumero: o.numero }) }));

  return {
    abertas: abertasLinhas.map(comObra),
    pagas: pagasLinhas.map(comObra),
    nfFornecedor: semNfLinhas.map(comObra),
    nfCliente,
    pagamentosAConfirmar,
    obrasParaLancar,
    fornecedores,
  };
}
