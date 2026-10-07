import Link from "next/link";
import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { ESCOLHER_RESPONSAVEL_NEGOCIO, NEGOCIOS, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioNegocio } from "./formulario";

export default async function NovoNegocio({ searchParams }: PageProps<"/negocios/novo">) {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const { funil, etapa } = await searchParams;
  const supabase = await criarClienteServidor();
  const [config, { data: parametros }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  const funilEscolhido = config.funis.find((f) => f.id === funil && f.ativo) ?? config.funis.find((f) => f.ativo);
  if (!funilEscolhido) return <p className="text-sm text-zinc-600">Nenhum funil ativo.</p>;
  const etapaEscolhida = config.etapas.find((e) => e.id === etapa && e.funilId === funilEscolhido.id && e.ativa);

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
          responsaveis={pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) ? config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL)) : []}
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
                }
              : null
          }
        />
      </Cartao>
    </div>
  );
}
