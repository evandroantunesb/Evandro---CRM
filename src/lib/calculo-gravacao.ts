import "server-only";
import type { LinhaCalculo } from "@/lib/calculo-reproduzivel";
import { env } from "@/lib/env";
import { mensagemErro } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Único caminho de escrita em `calculos_solares` (migration 20261023220000): o cliente autenticado não tem INSERT nem
 * UPDATE na tabela. O servidor
 *   1) confere, COM A SESSÃO do usuário, que ele pode gravar o cálculo do negócio (`autorizar_gravacao_calculo`:
 *      acesso comercial à empresa do negócio, vê o negócio, negócio não arquivado), recebendo empresa e membro;
 *   2) grava com a service role só a linha que ele mesmo montou pelo motor compartilhado (`montarLinhaCalculo`), com
 *      empresa, negócio e autoria vindos do passo 1 (nunca do formulário nem do `atual` informado).
 * O banco ainda recusa linha `completo` cuja referência tarifária não seja a oficial (trigger
 * `calculos_solares_referencia_oficial`).
 */
export type AutorizacaoCalculo = { empresaId: string; membroId: string; negocioId: string };

export const MENSAGEM_SEM_PERMISSAO_CALCULO = "Sem permissão para gravar o cálculo deste negócio.";
export const MENSAGEM_GRAVACAO_INDISPONIVEL = "Não foi possível gravar o cálculo agora: o servidor não está configurado para isso.";

/** Erro no formato do Supabase (a mensagem chega ao usuário por `mensagemErro`). */
const erroIndisponivel = () => ({ message: MENSAGEM_GRAVACAO_INDISPONIVEL, hint: "mensagem_usuario" });

/** Cliente privilegiado, ou null se a chave do servidor falta (nunca lança: quem chama restaura o que já mexeu). */
function clienteGravacao() {
  try {
    return criarClienteAdmin();
  } catch {
    return null;
  }
}

export async function autorizarGravacaoCalculo(
  supabase: SupabaseServidor,
  negocioId: string,
): Promise<{ ok: true; autorizacao: AutorizacaoCalculo } | { ok: false; mensagem: string }> {
  // Sem a chave do servidor, nada é gravado: recusa ANTES de mexer em kit, negócio ou cálculo.
  try {
    env.supabaseServiceRoleKey();
  } catch {
    return { ok: false, mensagem: MENSAGEM_GRAVACAO_INDISPONIVEL };
  }
  const { data, error } = await supabase.rpc("autorizar_gravacao_calculo", { p_negocio_id: negocioId });
  const linha = data?.[0];
  if (error || !linha) return { ok: false, mensagem: mensagemErro(error, MENSAGEM_SEM_PERMISSAO_CALCULO) };
  return { ok: true, autorizacao: { empresaId: linha.empresa_id, membroId: linha.membro_id, negocioId } };
}

/** Grava (insere ou substitui pela chave `negocio_id`) a linha montada pelo motor, com empresa e autoria autorizadas. */
export async function gravarLinhaCalculo(
  autorizacao: AutorizacaoCalculo,
  linha: LinhaCalculo,
  { observacoes, substituir }: { observacoes?: string | null; substituir: boolean },
) {
  const admin = clienteGravacao();
  if (!admin) return { error: erroIndisponivel() };
  const registro = {
    ...linha,
    ...(observacoes !== undefined ? { observacoes } : {}),
    empresa_id: autorizacao.empresaId,
    negocio_id: autorizacao.negocioId,
    criado_por: autorizacao.membroId,
    atualizado_por: autorizacao.membroId,
  };
  const { error } = substituir
    ? await admin.from("calculos_solares").upsert(registro, { onConflict: "negocio_id", ignoreDuplicates: false })
    : await admin.from("calculos_solares").insert(registro);
  return { error };
}

/** R6.2: marca a linha atual do negócio autorizado como desatualizada (sem tocar em números). */
export async function marcarCalculoDesatualizado(autorizacao: AutorizacaoCalculo, calculoId: string) {
  const admin = clienteGravacao();
  if (!admin) return { data: null, error: erroIndisponivel() };
  return admin
    .from("calculos_solares")
    .update({
      financeiro_desatualizado_em: new Date().toISOString(),
      financeiro_desatualizado_motivo: "entradas_alteradas_sem_resultado_novo",
    })
    .eq("id", calculoId)
    .eq("negocio_id", autorizacao.negocioId)
    .eq("empresa_id", autorizacao.empresaId)
    .select("id");
}

/** "Atualizar preço no cálculo": só `kit_preco` (payback segue nulo no P0), se o preço lido não mudou no meio. */
export async function atualizarPrecoDoCalculo(autorizacao: AutorizacaoCalculo, calculoId: string, precoLido: number, preco: number) {
  const admin = clienteGravacao();
  if (!admin) return { data: null, error: erroIndisponivel() };
  return admin
    .from("calculos_solares")
    .update({ kit_preco: preco, payback_meses: null, atualizado_por: autorizacao.membroId })
    .eq("id", calculoId)
    .eq("negocio_id", autorizacao.negocioId)
    .eq("empresa_id", autorizacao.empresaId)
    .eq("kit_preco", precoLido)
    .select("id");
}
