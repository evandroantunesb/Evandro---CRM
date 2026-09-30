import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Equipamentos } from "./equipamentos";
import { FormularioParametros, LinhaKit, NovoKit } from "./formularios";

export default async function ConfigCalculadora() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ kits }, { data: parametros }, { data: equipamentos }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).single(),
    supabase
      .from("equipamentos_empresa")
      .select("*")
      .eq("empresa_id", atual.empresaId)
      .order("tipo")
      .order("prioridade", { ascending: false }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Kits e calculadora</h1>
      <Cartao titulo={`Kits (${kits.length})`}>
        <p className="mb-3 text-sm text-zinc-600">
          Kits prontos do catálogo, com potência e preço. O vendedor escolhe um deles na calculadora do negócio.
        </p>
        {kits.map((k) => (
          <LinhaKit key={k.id} item={k} />
        ))}
        <div className="mt-3">
          <NovoKit />
        </div>
      </Cartao>
      <Cartao titulo="Parâmetros da calculadora">
        <p className="mb-3 text-sm text-zinc-600">
          Usados na estimativa de economia (modo comercial, sem simulação de engenharia). Valide estes números com o
          engenheiro responsável antes de usar com clientes.
        </p>
        {parametros && (
          <FormularioParametros
            parametros={{
              produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
              percentualFioB: parametros.percentual_fio_b,
              disponibilidadeMonoKwh: parametros.disponibilidade_mono_kwh,
              disponibilidadeBiKwh: parametros.disponibilidade_bi_kwh,
              disponibilidadeTriKwh: parametros.disponibilidade_tri_kwh,
              custoInstalacaoPorModulo: parametros.custo_instalacao_por_modulo,
              custoMaterialCaPorKwp: parametros.custo_material_ca_por_kwp,
              custoEngenharia: parametros.custo_engenharia,
              comissaoPercentual: parametros.comissao_percentual,
              margemDimensionamentoPct: parametros.margem_dimensionamento_pct,
              overloadMaximoPct: parametros.overload_maximo_pct,
              temperaturaMinimaProjetoC: parametros.temperatura_minima_projeto_c,
              siglaDistribuidoraAneel: parametros.sigla_distribuidora_aneel,
            }}
          />
        )}
      </Cartao>
      <Cartao titulo="Equipamentos ativos (kit automático)">
        <Equipamentos
          itens={(equipamentos ?? []).map((e) => ({
            id: e.id,
            tipo: e.tipo as "modulo" | "inversor",
            fabricante: e.fabricante,
            modelo: e.modelo,
            potenciaW: e.potencia_w,
            ativo: e.ativo,
            prioridade: e.prioridade,
            vocV: e.voc_v,
            iscA: e.isc_a,
            vmpV: e.vmp_v,
            impA: e.imp_a,
            coefTempVocPctC: e.coef_temp_voc_pct_c,
            tipoInversor: e.tipo_inversor,
            tensaoMaxDcV: e.tensao_max_dc_v,
            tensaoPartidaV: e.tensao_partida_v,
            mpptMinV: e.mppt_min_v,
            mpptMaxV: e.mppt_max_v,
            correnteMaxEntradaA: e.corrente_max_entrada_a,
            quantidadeMppt: e.quantidade_mppt,
            entradasPorMppt: e.entradas_por_mppt,
            precoReferenciaBRL: e.preco_referencia_brl,
            datasheetNome: e.datasheet_nome,
            potenciaDcMaximaEntradaW: e.potencia_dc_maxima_entrada_w,
            iscMaximoEntradaA: e.isc_maximo_entrada_a,
            tensaoAcV: e.tensao_ac_v,
            fasesCa: e.fases_ca,
            correnteMaxAcA: e.corrente_max_ac_a,
            eficienciaPct: e.eficiencia_pct,
            tensaoFasesAc: e.tensao_fases_ac,
          }))}
        />
      </Cartao>
    </div>
  );
}
