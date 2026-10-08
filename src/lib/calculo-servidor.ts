import "server-only";
import { calcular, DISPONIBILIDADE_PADRAO } from "@/lib/calculadora";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TipoLigacao } from "@/lib/tipos";

export type LinhaCalculo = Omit<
  Database["public"]["Tables"]["calculos_solares"]["Insert"],
  "negocio_id" | "observacoes" | "atualizado_por" | "criado_por"
>;

/**
 * Monta a linha de `calculos_solares` a partir do kit (personalizado, por
 * componentes) e dos parâmetros da empresa. Compartilhado entre "salvar kit
 * e cálculo" (negócio já existe) e a criação de negócio com calculadora
 * embutida (nova proposta).
 */
export async function montarLinhaCalculo(
  supabase: SupabaseServidor,
  empresaId: string,
  entrada: {
    kitNome: string;
    potenciaKwp: number;
    precoKit: number;
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
  },
): Promise<{ ok: true; linha: LinhaCalculo } | { ok: false; mensagem: string }> {
  if (entrada.consumoMedioKwh == null && entrada.valorFaturaMedio == null) {
    return { ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura." };
  }
  if (entrada.potenciaKwp <= 0) {
    return { ok: false, mensagem: "Informe ao menos um módulo com potência para calcular." };
  }
  const consumoMedioKwh = entrada.consumoMedioKwh ?? entrada.valorFaturaMedio! / entrada.tarifaKwh;

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]] as number;
  const resultado = calcular({
    potenciaKwp: entrada.potenciaKwp,
    precoKit: entrada.precoKit,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: entrada.tarifaKwh,
    produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  return {
    ok: true,
    linha: {
      empresa_id: empresaId,
      kit_id: null,
      kit_nome: entrada.kitNome,
      kit_potencia_kwp: entrada.potenciaKwp,
      kit_preco: entrada.precoKit,
      tipo_ligacao: entrada.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: entrada.valorFaturaMedio,
      tarifa_kwh: entrada.tarifaKwh,
      produtividade_kwh_kwp_mes: parametros.produtividade_kwh_kwp_mes,
      percentual_fio_b: parametros.percentual_fio_b,
      disponibilidade_kwh: disponibilidadeKwh,
      geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      // Sem preço do kit (negócio sem valor definido), o payback não tem
      // significado — fica em aberto em vez de mostrar "0 meses".
      payback_meses: entrada.precoKit > 0 ? resultado.paybackMeses : null,
    },
  };
}
