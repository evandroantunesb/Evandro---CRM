import { mensagemErro } from "@/lib/erros";
import { formatarMoeda } from "@/lib/formatacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TipoCalculoComissao } from "@/lib/tipos";

/** Uma faixa de resultado do plano de comissão (guardada em jsonb). */
export type FaixaComissao = {
  resultado_minimo: number;
  resultado_maximo: number | null;
  valor: number;
};

/** Faixa cujo intervalo [resultado_minimo, resultado_maximo) contém o resultado, ou null se nenhuma cobrir. */
export function encontrarFaixa(faixas: FaixaComissao[], resultado: number): FaixaComissao | null {
  return (
    faixas.find(
      (f) => resultado >= f.resultado_minimo && (f.resultado_maximo === null || resultado < f.resultado_maximo),
    ) ?? null
  );
}

/** Valor da comissão a partir da faixa aplicável: percentual (ex.: 5 = 5%) ou multiplicador direto sobre o resultado. */
export function calcularValorComissao(tipoCalculo: TipoCalculoComissao, faixa: FaixaComissao | null, resultado: number): number {
  if (!faixa) return 0;
  return tipoCalculo === "percentual" ? resultado * (faixa.valor / 100) : resultado * faixa.valor;
}

/** Descrição legível de uma faixa ("R$ 0,00 até R$ 10.000,00: 5%" / "...: 1,5x"). */
export function formatarFaixa(tipoCalculo: TipoCalculoComissao, faixa: FaixaComissao): string {
  const de = formatarMoeda(faixa.resultado_minimo);
  const ate = faixa.resultado_maximo === null ? "sem teto" : formatarMoeda(faixa.resultado_maximo);
  const valor = tipoCalculo === "percentual" ? `${faixa.valor}%` : `${faixa.valor}x`;
  return `${de} até ${ate}: ${valor}`;
}

/** Início (inclusivo) e fim (exclusivo) do mês em ISO, prontos para filtrar colunas timestamptz. */
export function limitesMes(referencia: string) {
  const inicio = new Date(`${referencia}T00:00:00Z`);
  const [ano, mes] = referencia.split("-").map(Number);
  return {
    inicioIso: inicio.toISOString(),
    fimExclusivoIso: new Date(Date.UTC(ano, mes, 1)).toISOString(),
  };
}

export type ResultadoCalculoComissao =
  | { ok: true; resultadoApurado: number; salarioBase: number; valorComissao: number; valorTotal: number; faixaAplicada: FaixaComissao | null }
  | { ok: false; mensagem: string };

/**
 * Calcula (ou recalcula) a comissão de um colaborador num mês: fonte 100% causal
 * (`eventos`, via RPC `calcular_receita_causal_comissao` — fechamento causal ativo de
 * `deal.won`/`deal.reopened` + deltas de `deal.value_corrected`, `responsavel_id`
 * congelado), plano VIGENTE naquele mês (não o atual), e grava a "foto" em
 * `comissoes_calculadas`. Nunca sobrescreve uma comissão `fechada` — bloqueado tanto aqui
 * (mensagem amigável) quanto no banco (trigger `comissoes_calculadas_bloquear_fechada`,
 * defesa em profundidade). Sem plano com `vigencia_inicio` aplicável àquele mês (ex.: mês
 * anterior a outubro/2026, antes de existir qualquer versão), retorna erro claro em vez de
 * cair pro plano atual.
 */
export async function calcularComissaoMes(
  supabase: SupabaseServidor,
  params: { empresaId: string; membroId: string; referencia: string; calculadoPor: string },
): Promise<ResultadoCalculoComissao> {
  const { empresaId, membroId, referencia, calculadoPor } = params;

  const { data: existente } = await supabase
    .from("comissoes_calculadas")
    .select("status")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .eq("referencia", referencia)
    .maybeSingle();
  if (existente?.status === "fechada") {
    return { ok: false, mensagem: "Esta comissão já está fechada e não pode ser recalculada." };
  }

  const { data: plano } = await supabase
    .from("planos_comissao")
    .select("id, salario_base, tipo_calculo, faixas")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .lte("vigencia_inicio", referencia)
    .order("vigencia_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plano) return { ok: false, mensagem: "Sem plano vigente para este período." };

  const { inicioIso, fimExclusivoIso } = limitesMes(referencia);
  const { data: resultadoApurado, error: erroCausal } = await supabase.rpc("calcular_receita_causal_comissao", {
    p_empresa_id: empresaId,
    p_membro_id: membroId,
    p_desde: inicioIso,
    p_ate_exclusivo: fimExclusivoIso,
  });
  if (erroCausal) return { ok: false, mensagem: mensagemErro(erroCausal, "Não foi possível calcular a comissão.") };

  const faixas = plano.faixas as unknown as FaixaComissao[];
  const faixaAplicada = encontrarFaixa(faixas, resultadoApurado ?? 0);
  const valorComissao = calcularValorComissao(plano.tipo_calculo, faixaAplicada, resultadoApurado ?? 0);
  const salarioBase = plano.salario_base ?? 0;
  const valorTotal = salarioBase + valorComissao;

  const { error } = await supabase.from("comissoes_calculadas").upsert(
    {
      empresa_id: empresaId,
      membro_id: membroId,
      plano_id: plano.id,
      referencia,
      resultado_apurado: resultadoApurado ?? 0,
      salario_base: salarioBase,
      valor_comissao: valorComissao,
      valor_total: valorTotal,
      faixa_aplicada: faixaAplicada,
      calculado_por: calculadoPor,
    },
    { onConflict: "empresa_id,membro_id,referencia" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível calcular a comissão.") };

  return { ok: true, resultadoApurado: resultadoApurado ?? 0, salarioBase, valorComissao, valorTotal, faixaAplicada };
}
