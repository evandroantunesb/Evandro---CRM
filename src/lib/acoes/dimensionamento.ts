"use server";

import { calcular, DISPONIBILIDADE_PADRAO } from "@/lib/calculadora";
import { avaliarCombinacaoEscolhida, paraEquipamentoAtivo } from "@/lib/dimensionamento";
import { mensagemErro } from "@/lib/erros";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TipoLigacao } from "@/lib/tipos";

type LinhaDimensionamento = Database["public"]["Tables"]["dimensionamentos_solares"]["Insert"];

/**
 * Fonte única de persistência do dimensionamento solar (pedido do Evandro,
 * 2026-09-30, após o diagnóstico apontar 3 motores de cálculo divergentes na
 * mesma tela). Recebe só a escolha do vendedor (módulo, inversor, quantidade,
 * consumo, tarifa) e busca ela mesma, no servidor, tudo que é autoritativo
 * (o equipamento cadastrado, a margem/overload máximo/temperatura da
 * empresa) — nunca confia em quantidade/potência/overload calculados no
 * cliente. Roda o mesmo motor de `src/lib/dimensionamento.ts` usado na
 * sugestão automática, então uma combinação escolhida manualmente passa
 * pelas mesmas validações elétricas.
 *
 * Compartilhada entre a criação do negócio (chamada por `criarNegocio`) e,
 * quando a Etapa B da unificação estiver pronta, a tela de edição do sistema.
 */
export async function salvarDimensionamento(
  supabase: SupabaseServidor,
  empresaId: string,
  membroId: string,
  entrada: {
    negocioId: string;
    moduloEquipamentoId: string;
    inversorEquipamentoId: string;
    quantidadeModulos: number;
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
    origemTarifa: "manual" | "aneel";
    produtividadeKwhKwpMes?: number | null;
    origemProdutividade?: "pvgis" | "nasa";
    precoNegocio: number;
  },
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  if (entrada.consumoMedioKwh == null && entrada.valorFaturaMedio == null) {
    return { ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura." };
  }

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const { data: equipamentos } = await supabase
    .from("equipamentos_empresa")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .in("id", [entrada.moduloEquipamentoId, entrada.inversorEquipamentoId]);
  const moduloRow = equipamentos?.find((e) => e.id === entrada.moduloEquipamentoId && e.tipo === "modulo");
  const inversorRow = equipamentos?.find((e) => e.id === entrada.inversorEquipamentoId && e.tipo === "inversor");
  if (!moduloRow || !inversorRow) {
    return { ok: false, mensagem: "Módulo ou inversor não encontrado no catálogo ativo da empresa." };
  }

  const opcao = avaliarCombinacaoEscolhida(
    paraEquipamentoAtivo(moduloRow),
    paraEquipamentoAtivo(inversorRow),
    entrada.quantidadeModulos,
    parametros.overload_maximo_pct,
    parametros.overload_critico_pct,
    parametros.temperatura_minima_projeto_c,
  );
  if (!opcao) {
    return { ok: false, mensagem: "Essa quantidade de módulos não forma um arranjo eletricamente compatível com o inversor escolhido." };
  }

  const consumoMedioKwh = entrada.consumoMedioKwh ?? entrada.valorFaturaMedio! / entrada.tarifaKwh;
  const produtividadeValida = entrada.produtividadeKwhKwpMes != null && entrada.produtividadeKwhKwpMes > 0;
  const produtividadeKwhKwpMes = produtividadeValida ? entrada.produtividadeKwhKwpMes! : parametros.produtividade_kwh_kwp_mes;
  const origemProdutividade = produtividadeValida ? (entrada.origemProdutividade ?? "pvgis") : "padrao";

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]] as number;
  const resultado = calcular({
    potenciaKwp: opcao.potenciaDcKwp,
    precoKit: entrada.precoNegocio,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: entrada.tarifaKwh,
    produtividadeKwhKwpMes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  const linha: LinhaDimensionamento = {
    empresa_id: empresaId,
    negocio_id: entrada.negocioId,
    modulo_equipamento_id: moduloRow.id,
    inversor_equipamento_id: inversorRow.id,
    quantidade_modulos: opcao.quantidadeModulos,
    potencia_dc_kwp: opcao.potenciaDcKwp,
    potencia_ac_kw: opcao.potenciaAcKw,
    dc_ac_ratio: opcao.dcAcRatio,
    overload_pct: opcao.overloadPct,
    validacao: opcao.validacao,
    validacao_eletrica: opcao.validacaoEletrica,
    margem_dimensionamento_pct: parametros.margem_dimensionamento_pct,
    overload_maximo_pct: parametros.overload_maximo_pct,
    overload_critico_pct: parametros.overload_critico_pct,
    temperatura_minima_projeto_c: parametros.temperatura_minima_projeto_c,
    consumo_medio_kwh: consumoMedioKwh,
    valor_fatura_medio: entrada.valorFaturaMedio,
    produtividade_kwh_kwp_mes: produtividadeKwhKwpMes,
    origem_produtividade: origemProdutividade,
    tarifa_kwh: entrada.tarifaKwh,
    origem_tarifa: entrada.origemTarifa,
    tipo_ligacao: entrada.tipoLigacao,
    disponibilidade_kwh: disponibilidadeKwh,
    preco_negocio: entrada.precoNegocio,
    geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
    economia_mensal: resultado.economiaMensal,
    payback_meses: entrada.precoNegocio > 0 ? resultado.paybackMeses : null,
    criado_por: membroId,
    atualizado_por: membroId,
  };

  const { error } = await supabase.from("dimensionamentos_solares").upsert(linha, { onConflict: "negocio_id" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o dimensionamento.") };

  // Ponte temporária (Etapa A): `calculos_solares`/`kit_componentes` ainda são a fonte que a
  // proposta (`negocios/[id]/proposta.tsx`) e a tela de edição (`kit-personalizado.tsx`) leem.
  // Copia o MESMO resultado já calculado acima — não recalcula por uma segunda implementação.
  // Sai quando a Etapa C apontar a proposta direto pra `dimensionamentos_solares`.
  await supabase.from("calculos_solares").upsert(
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      kit_id: null,
      kit_nome: `${moduloRow.fabricante} ${moduloRow.modelo} (${opcao.quantidadeModulos}x) + ${inversorRow.fabricante} ${inversorRow.modelo}`,
      kit_potencia_kwp: opcao.potenciaDcKwp,
      kit_preco: entrada.precoNegocio,
      tipo_ligacao: entrada.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: entrada.valorFaturaMedio,
      tarifa_kwh: entrada.tarifaKwh,
      produtividade_kwh_kwp_mes: produtividadeKwhKwpMes,
      percentual_fio_b: parametros.percentual_fio_b,
      disponibilidade_kwh: disponibilidadeKwh,
      geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      payback_meses: entrada.precoNegocio > 0 ? resultado.paybackMeses : null,
      atualizado_por: membroId,
      criado_por: membroId,
    },
    { onConflict: "negocio_id" },
  );
  await supabase.from("kit_componentes").delete().eq("negocio_id", entrada.negocioId);
  await supabase.from("kit_componentes").insert([
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      tipo: "modulo" as const,
      descricao: `${moduloRow.fabricante} ${moduloRow.modelo}`,
      potencia_w: moduloRow.potencia_w,
      quantidade: opcao.quantidadeModulos,
      ordem: 0,
    },
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      tipo: "inversor" as const,
      descricao: `${inversorRow.fabricante} ${inversorRow.modelo}`,
      potencia_w: inversorRow.potencia_w,
      quantidade: 1,
      ordem: 1,
    },
  ]);

  return { ok: true };
}
