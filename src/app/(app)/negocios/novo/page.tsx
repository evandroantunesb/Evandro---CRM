import Link from "next/link";
import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { paraEquipamentoAtivo } from "@/lib/dimensionamento";
import { participaDoMotor } from "@/lib/equipamentos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioNegocio } from "./formulario";

export default async function NovoNegocio({ searchParams }: PageProps<"/negocios/novo">) {
  const { atual } = await exigirPapel();
  const { funil, etapa } = await searchParams;
  const supabase = await criarClienteServidor();
  const [config, { data: parametros }, { data: equipamentos }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
    // Catálogo ativo pro motor de dimensionamento automático (Fase 4 da reconciliação) — só os
    // equipamentos ligados em Configurações → Calculadora entram nas opções sugeridas. O status
    // técnico (incompleto/descontinuado ficam de fora) é filtrado logo abaixo, em JS, pra que um
    // banco ainda sem a coluna `status_tecnico` não esvazie o catálogo — ver `participaDoMotor`.
    supabase
      .from("equipamentos_empresa")
      .select("*")
      .eq("empresa_id", atual.empresaId)
      .eq("ativo", true)
      .order("tipo")
      .order("prioridade", { ascending: false }),
  ]);
  const funilEscolhido = config.funis.find((f) => f.id === funil && f.ativo) ?? config.funis.find((f) => f.ativo);
  if (!funilEscolhido) return <p className="text-sm text-zinc-600">Nenhum funil ativo.</p>;
  const etapaEscolhida = config.etapas.find((e) => e.id === etapa && e.funilId === funilEscolhido.id && e.ativa);

  const catalogoMotor = (equipamentos ?? []).filter((e) => participaDoMotor(e.status_tecnico));
  const modulosAtivos = catalogoMotor.filter((e) => e.tipo === "modulo").map(paraEquipamentoAtivo);
  const inversoresAtivos = catalogoMotor.filter((e) => e.tipo === "inversor").map(paraEquipamentoAtivo);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/negocios" className="text-sm text-zinc-600 hover:underline">
        ← Negócios
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">Adicionar negócio</h1>
      <Cartao>
        <FormularioNegocio
          funilId={funilEscolhido.id}
          etapaId={etapaEscolhida?.id}
          origens={config.origens.filter((o) => o.ativa)}
          responsaveis={atual.papel === "vendedor" ? [] : config.membros.filter((m) => m.ativo)}
          meuMembroId={atual.membroId}
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
                  margemDimensionamentoPct: parametros.margem_dimensionamento_pct,
                  overloadMaximoPct: parametros.overload_maximo_pct,
                  overloadCriticoPct: parametros.overload_critico_pct,
                  temperaturaMinimaProjetoC: parametros.temperatura_minima_projeto_c,
                  siglaDistribuidoraAneelFallback: parametros.sigla_distribuidora_aneel,
                }
              : null
          }
          modulosAtivos={modulosAtivos}
          inversoresAtivos={inversoresAtivos}
        />
      </Cartao>
    </div>
  );
}
