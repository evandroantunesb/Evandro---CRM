import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Temperatura calculada pelo banco (`temperatura_negocios`) a partir das regras da empresa. */
export type Temperatura = "quente" | "morno" | "frio";

/** Sinais do cardápio de regras (mesma lista do banco). O gestor não cria sinal novo, só configura estes. */
export const SINAIS_TEMPERATURA = [
  "contrato_gerado",
  "etapa",
  "etapa_negociacao",
  "proposta_emitida",
  "prazo_instalacao",
  "decisor",
  "orcamento_outra_empresa",
  "busca_financiamento",
  "somente_pesquisando",
  "sem_atividade",
  "tarefa_atrasada",
] as const;
export type SinalTemperatura = (typeof SINAIS_TEMPERATURA)[number];

/** Sinais com parâmetro "dias". */
export const SINAIS_COM_DIAS: readonly SinalTemperatura[] = ["proposta_emitida", "sem_atividade", "tarefa_atrasada"];

export const ROTULO_SINAL_TEMPERATURA: Record<SinalTemperatura, string> = {
  contrato_gerado: "Contrato gerado",
  etapa: "Está na etapa",
  etapa_negociacao: "Etapa marcada como negociação",
  proposta_emitida: "Proposta emitida recentemente",
  prazo_instalacao: "Prazo de instalação do cliente",
  decisor: "Contato é o decisor",
  orcamento_outra_empresa: "Pediu orçamento em outra empresa",
  busca_financiamento: "Busca financiamento",
  somente_pesquisando: "Cliente só pesquisando",
  sem_atividade: "Sem atividade",
  tarefa_atrasada: "Tarefa atrasada",
};

export const ROTULO_TEMPERATURA: Record<Temperatura, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };

export type TemperaturaNegocio = { temperatura: Temperatura; porque: string };

function plural(dias: number) {
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** Texto do "porquê" mostrado no card: o nome da regra que decidiu, com os dias quando houver. */
export function textoPorque(sinal: string | null, dias: number | null): string {
  if (!sinal) return "Nenhuma regra se aplica";
  if (sinal === "sem_atividade" && dias != null) return `Sem atividade há ${plural(dias)}`;
  if (sinal === "tarefa_atrasada" && dias != null) return `Tarefa atrasada há ${plural(dias)}`;
  if (sinal === "proposta_emitida" && dias != null) return dias === 0 ? "Proposta emitida hoje" : `Proposta emitida há ${plural(dias)}`;
  return ROTULO_SINAL_TEMPERATURA[sinal as SinalTemperatura] ?? "Regra da empresa";
}

/** Temperatura dos negócios abertos informados (os demais ficam fora do mapa). */
export async function carregarTemperaturas(
  supabase: SupabaseClient<Database>,
  negocioIds: string[],
): Promise<Map<string, TemperaturaNegocio>> {
  const mapa = new Map<string, TemperaturaNegocio>();
  if (!negocioIds.length) return mapa;
  // Sem temperatura (falha na consulta) o card só não mostra o selo: não derruba a tela.
  const { data } = await supabase.rpc("temperatura_negocios", { p_negocio_ids: negocioIds });
  for (const linha of data ?? []) {
    mapa.set(linha.negocio_id, {
      temperatura: linha.temperatura as Temperatura,
      porque: textoPorque(linha.sinal, linha.dias),
    });
  }
  return mapa;
}
