import "server-only";
import {
  BUCKET_COMPROVANTES,
  type AvisoPagamentoVM,
  type PagamentoAConfirmarVM,
  type SituacaoAviso,
} from "@/lib/avisos-pagamento-regras";
import { avisarSchemaAusente, funcaoAusente, tabelaAusente } from "@/lib/schema-ausente";
import { assinarImagensEmLote } from "@/lib/storage-imagens";
import type { criarClienteServidor } from "@/lib/supabase/server";

/*
 * Pagamento informado pelo vendedor (20261113100000_aviso_pagamento_vendedor.sql): o vendedor avisa que o cliente
 * pagou, com comprovante; admin, gestor ou o Operacional confirma ou devolve. A autorização está toda nas RPCs.
 */

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Validade dos links de download do comprovante. */
const VALIDADE_LINK_S = 60 * 60;

/** Nomes dos membros ativos da empresa (inclui quem é do Operacional, que o comercial não lê em `perfis`). */
async function nomesDaEmpresa(supabase: Supabase, empresaId: string): Promise<(id: string) => string> {
  const { data } = await supabase.rpc("identidade_membros", { p_empresa_id: empresaId });
  const mapa = new Map((data ?? []).map((m) => [m.membro_id, m.nome]));
  return (id) => mapa.get(id) ?? "usuário inativo";
}

/**
 * Último aviso do vendedor no contrato ("o cliente pagou", com comprovante), que o cartão Pagamento do Pro mostra,
 * ou null. Lê pela RLS de quem vê o negócio.
 */
export async function carregarUltimoAviso(
  supabase: Supabase,
  { empresaId, membroId }: { empresaId: string; membroId: string },
  contratoId: string,
): Promise<AvisoPagamentoVM | null> {
  const { data, error } = await supabase
    .from("avisos_pagamento")
    .select(
      "id, situacao, data_pagamento, observacao, comprovante_caminho, comprovante_nome, informado_por_membro_id, informado_em, encerrado_por_membro_id, encerrado_em, motivo_devolucao",
    )
    .eq("contrato_id", contratoId)
    .order("informado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Preview antes da migration (usa o banco de produção): sem a tabela, o cartão segue como antes.
  if (tabelaAusente(error, "avisos_pagamento")) {
    avisarSchemaAusente("avisos_pagamento", error);
    return null;
  }
  if (error) throw error;
  if (!data) return null;
  const [nome, urls] = await Promise.all([
    nomesDaEmpresa(supabase, empresaId),
    assinarImagensEmLote(supabase, BUCKET_COMPROVANTES, [data.comprovante_caminho], VALIDADE_LINK_S),
  ]);
  return {
    id: data.id,
    situacao: data.situacao as SituacaoAviso,
    dataPagamento: data.data_pagamento,
    observacao: data.observacao,
    comprovanteNome: data.comprovante_nome,
    comprovanteUrl: urls.get(data.comprovante_caminho) ?? null,
    informadoPor: nome(data.informado_por_membro_id),
    informadoEm: data.informado_em,
    souQuemInformou: data.informado_por_membro_id === membroId,
    encerradoPor: data.encerrado_por_membro_id ? nome(data.encerrado_por_membro_id) : null,
    encerradoEm: data.encerrado_em,
    motivoDevolucao: data.motivo_devolucao,
  };
}

/** Lista "Pagamentos a confirmar" (a RPC decide quem vê o quê). */
export async function carregarPagamentosAConfirmar(supabase: Supabase, empresaId: string): Promise<PagamentoAConfirmarVM[]> {
  const { data, error } = await supabase.rpc("pagamentos_a_confirmar", { p_empresa_id: empresaId });
  if (funcaoAusente(error, "pagamentos_a_confirmar")) {
    avisarSchemaAusente("pagamentos_a_confirmar", error);
    return [];
  }
  if (error) throw error;
  const linhas = data ?? [];
  if (!linhas.length) return [];
  const [nome, urls] = await Promise.all([
    nomesDaEmpresa(supabase, empresaId),
    assinarImagensEmLote(supabase, BUCKET_COMPROVANTES, linhas.map((l) => l.comprovante_caminho), VALIDADE_LINK_S),
  ]);
  return linhas.map((l) => ({
    avisoId: l.aviso_id,
    contratoId: l.contrato_id,
    negocioId: l.negocio_id,
    negocioNumero: l.negocio_numero,
    cliente: l.cliente_nome ?? "Cliente",
    cidade: l.cidade ? (l.uf ? `${l.cidade}/${l.uf}` : l.cidade) : null,
    valor: l.valor,
    condicao: l.condicao,
    dataPagamento: l.data_pagamento,
    observacao: l.observacao,
    comprovanteNome: l.comprovante_nome,
    comprovanteUrl: urls.get(l.comprovante_caminho) ?? null,
    informadoPor: nome(l.informado_por_membro_id),
    informadoEm: l.informado_em,
  }));
}

/** Quantos pagamentos esperam confirmação de quem chama (sininho e menu). Falha vira zero: é só um contador. */
export async function contarPagamentosAConfirmar(supabase: Supabase, empresaId: string): Promise<number> {
  const { data, error } = await supabase.rpc("pagamentos_a_confirmar", { p_empresa_id: empresaId });
  return error ? 0 : (data?.length ?? 0);
}
