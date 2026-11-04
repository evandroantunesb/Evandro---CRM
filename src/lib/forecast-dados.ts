import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Etapa } from "@/lib/crm";
import { inicioDoMes, mesesDoForecast, montarForecast, somarMeses, type MetaReceita, type NegocioForecastEntrada } from "@/lib/forecast";
import { carregarLeadsParados } from "@/lib/leads-parados";
import type { Database } from "@/lib/supabase/database.types";
import { carregarTemperaturas } from "@/lib/temperatura";

/**
 * Dados do Forecast: negócios abertos que a pessoa enxerga (RLS: vendedor e SDR os próprios, gestor a equipe, admin
 * todos), com a chance da etapa, a temperatura e se está parado; e as metas de receita que cobrem os três meses.
 * `responsavelId` restringe à carteira de uma pessoa ("Minha carteira").
 */
export async function carregarForecast(
  supabase: SupabaseClient<Database>,
  opcoes: { empresaId: string; hoje: string; etapas: Etapa[]; diasParado: number; responsavelId?: string },
) {
  const { empresaId, hoje, etapas, diasParado, responsavelId } = opcoes;
  const meses = mesesDoForecast(hoje);
  const fimDoPeriodo = new Date(Date.parse(`${somarMeses(meses[2], 1)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  let consulta = supabase
    .from("negocios")
    .select("id, numero, titulo, valor, fechamento_previsto, etapa_id, responsavel_id, contatos(nome)")
    .eq("empresa_id", empresaId)
    .eq("status", "aberto")
    .is("arquivado_em", null);
  if (responsavelId) consulta = consulta.eq("responsavel_id", responsavelId);

  let consultaMetas = supabase
    .from("metas")
    .select("membro_id, valor_alvo, periodo_inicio, periodo_fim")
    .eq("empresa_id", empresaId)
    .eq("metrica", "receita")
    .eq("ativa", true)
    .lte("periodo_inicio", fimDoPeriodo)
    .gte("periodo_fim", inicioDoMes(hoje));
  if (responsavelId) consultaMetas = consultaMetas.eq("membro_id", responsavelId);

  const [{ data: negocios, error }, { data: metas, error: erroMetas }, parados] = await Promise.all([
    consulta.limit(2000),
    consultaMetas,
    carregarLeadsParados(supabase, empresaId, { responsavelId, diasLimite: diasParado }),
  ]);
  if (error) throw error;
  if (erroMetas) throw erroMetas;

  const temperaturas = await carregarTemperaturas(supabase, (negocios ?? []).map((n) => n.id));
  const idsParados = new Set(parados.map((p) => p.id));
  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));

  const entrada: NegocioForecastEntrada[] = (negocios ?? []).map((n) => {
    const etapa = etapaPorId.get(n.etapa_id);
    const temperatura = temperaturas.get(n.id);
    return {
      id: n.id,
      numero: n.numero,
      titulo: n.titulo,
      contatoNome: (n.contatos as unknown as { nome: string } | null)?.nome ?? n.titulo,
      etapaNome: etapa?.nome ?? "—",
      chanceBase: etapa?.chanceFechamento ?? null,
      temperatura: temperatura?.temperatura ?? null,
      risco: temperatura?.temperatura === "frio" ? temperatura.porque : null,
      valor: n.valor,
      fechamentoPrevisto: n.fechamento_previsto,
      parado: idsParados.has(n.id),
      responsavelId: n.responsavel_id,
    };
  });

  const metasReceita: MetaReceita[] = (metas ?? []).map((m) => ({
    membroId: m.membro_id,
    valorAlvo: Number(m.valor_alvo),
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
  }));

  return montarForecast(entrada, metasReceita, hoje);
}
