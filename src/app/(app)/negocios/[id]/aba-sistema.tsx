import { Cartao } from "@/components/ui";
import type { BaseTributaria } from "@/lib/tarifa-gd";
import { type TipoComponenteKit, type TipoLigacao } from "@/lib/tipos";
import { KitPersonalizado, type CalculoHistorico } from "./kit-personalizado";
import type { Ficha } from "./dados-ficha";
import { EdicaoDados } from "./edicao-dados";

/** Última linha do histórico do cálculo (cópia jsonb da linha substituída) no formato da ficha. */
function historicoDaTela(h: { arquivado_em: string; motivo: string; linha: unknown } | null): CalculoHistorico | null {
  if (!h || !h.linha || typeof h.linha !== "object") return null;
  const l = h.linha as Record<string, unknown>;
  return {
    arquivadoEm: h.arquivado_em,
    motivo: h.motivo,
    estadoFinanceiro: String(l.estado_financeiro ?? "legado"),
    kitNome: String(l.kit_nome ?? ""),
    consumoMedioKwh: Number(l.consumo_medio_kwh),
    tarifaKwh: Number(l.tarifa_kwh),
    economiaMensal: l.economia_mensal == null ? null : Number(l.economia_mensal),
  };
}

/** Aba Conta e sistema: conta de luz e local, e o kit com a prévia do cálculo. */
export function AbaSistema({ ficha }: { ficha: Ficha }) {
  const { negocio, componentes, parametros, precoDesatualizado, vigenciaDaTela, contextoEstimativa, historicoCalculo, calculo } = ficha;
  return (
    <div className="flex flex-col gap-4">
    <Cartao titulo="Conta de luz e local"><EdicaoDados ficha={ficha} secao="tecnico" /></Cartao>
    <Cartao titulo="Kit personalizado">
      <KitPersonalizado
        negocioId={negocio.id}
        negocioValor={negocio.valor}
        estruturaTelhado={negocio.estrutura_telhado}
        padraoCliente={negocio.padrao_cliente}
        consumoMedioKwhPadrao={negocio.consumo_medio_kwh}
        consumoEstimadoKwhPadrao={negocio.consumo_estimado_kwh}
        tarifaEfetivaKwhPadrao={negocio.tarifa_efetiva_kwh}
        valorFaturaMedioPadrao={negocio.valor_conta_energia}
        componentesSalvos={(componentes ?? []).map((c) => ({
          tipo: c.tipo as TipoComponenteKit,
          descricao: c.descricao,
          potenciaW: c.potencia_w,
          quantidade: c.quantidade,
        }))}
        parametros={
          parametros
            ? {
                produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
                percentualFioB: parametros.percentual_fio_b,
                disponibilidadeMonoKwh: parametros.disponibilidade_mono_kwh,
                disponibilidadeBiKwh: parametros.disponibilidade_bi_kwh,
                disponibilidadeTriKwh: parametros.disponibilidade_tri_kwh,
                custoInstalacaoPorModulo: parametros.custo_instalacao_por_modulo,
                custoMaterialCaPorKwp: parametros.custo_material_ca_por_kwp,
                custoEngenharia: parametros.custo_engenharia,
                comissaoPercentual: parametros.comissao_percentual,
              }
            : null
        }
        precoDesatualizado={precoDesatualizado}
        vigencia={vigenciaDaTela}
        contexto={contextoEstimativa}
        historico={historicoDaTela(historicoCalculo)}
        calculo={
          calculo
            ? {
                id: calculo.id,
                kitNome: calculo.kit_nome,
                kitPreco: calculo.kit_preco,
                tipoLigacao: calculo.tipo_ligacao as TipoLigacao,
                consumoMedioKwh: calculo.consumo_medio_kwh,
                valorFaturaMedio: calculo.valor_fatura_medio,
                tarifaKwh: calculo.tarifa_kwh,
                geracaoEstimadaKwhMes: calculo.geracao_estimada_kwh_mes,
                economiaMensal: calculo.economia_mensal,
                paybackMeses: calculo.payback_meses,
                observacoes: calculo.observacoes,
                estadoFinanceiro: calculo.estado_financeiro,
                contaSemSolar: calculo.conta_sem_solar,
                contaComSolar: calculo.conta_com_solar,
                kwhCompensado: calculo.kwh_compensado,
                kwhNaoCompensado: calculo.kwh_nao_compensado,
                custoFioB: calculo.custo_fio_b,
                tarifaBaseTributaria: calculo.tarifa_base_tributaria as BaseTributaria | null,
                tarifaOrigem: calculo.tarifa_origem,
                distribuidora: calculo.distribuidora,
                fioBRsMwh: calculo.fio_b_rs_mwh,
                percentualLegalFioB: calculo.percentual_legal_fio_b,
                vigenciaInicio: calculo.fio_b_vigencia_inicio,
                vigenciaFim: calculo.fio_b_vigencia_fim,
                disponibilidadeKwh: calculo.disponibilidade_kwh,
                dataReferencia: calculo.data_referencia,
                ressalvas: calculo.ressalvas,
              }
            : null
        }
      />
    </Cartao>
    </div>
  );
}
