import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioParametros } from "../formularios";

export default async function ParametrosCalculadora() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();

  return (
    <Cartao titulo="Parâmetros da calculadora">
      <p className="mb-3 text-sm text-zinc-600">
        Usados na estimativa de economia e no dimensionamento automático. Valide estes números com o engenheiro
        responsável antes de usar com clientes.
      </p>
      {parametros ? (
        // Valores crus do banco: o formulário trata ausência (coluna ainda não migrada, registro
        // antigo) mostrando o padrão do sistema ou campo vazio — nunca "NaN"/"undefined".
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
            overloadCriticoPct: parametros.overload_critico_pct,
            temperaturaMinimaProjetoC: parametros.temperatura_minima_projeto_c,
            siglaDistribuidoraAneel: parametros.sigla_distribuidora_aneel,
          }}
        />
      ) : (
        <p className="text-sm text-zinc-500">Não configurado: a empresa ainda não tem parâmetros da calculadora.</p>
      )}
    </Cartao>
  );
}
