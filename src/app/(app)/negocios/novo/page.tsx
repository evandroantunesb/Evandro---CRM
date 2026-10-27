import Link from "next/link";
import { OpcoesTipoNegocio } from "@/components/novo-negocio";
import { carregarContextoEstimativa } from "@/lib/contexto-estimativa";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { ESCOLHER_RESPONSAVEL_NEGOCIO, NEGOCIOS, PROPOSTA_E_CONTRATO, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioNegocio } from "./formulario";
import { FormularioEletroposto } from "./formulario-eletroposto";

export default async function NovoNegocio({ searchParams }: PageProps<"/negocios/novo">) {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const { funil, etapa, tipo, contato: contatoParam } = await searchParams;
  const supabase = await criarClienteServidor();
  // "Novo negócio para este cliente": o cliente vem escolhido (só se quem cria o vê, pela RLS de contatos).
  const contatoId = typeof contatoParam === "string" && /^[0-9a-f-]{36}$/i.test(contatoParam) ? contatoParam : null;
  const { data: contatoInicial } = contatoId
    ? await supabase.from("contatos").select("id, nome, telefone, email, endereco, cidade, uf").eq("id", contatoId).maybeSingle()
    : { data: null };
  // Contexto regulatório sem qualificação: a tela aplica o tipo de cliente e a distribuidora escolhidos (mesmo
  // objeto que o servidor monta ao gravar), para a prévia ao vivo ser o mesmo cálculo que fica salvo.
  const [config, { data: parametros }, contexto, { data: ultimo }, { data: empresa }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
    carregarContextoEstimativa(supabase, { tipoCliente: null, distribuidoraInformada: null }),
    supabase
      .from("negocios")
      .select("origem_id")
      .eq("empresa_id", atual.empresaId)
      .eq("responsavel_id", atual.membroId)
      .not("origem_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("empresas").select("eletroposto_ativo").eq("id", atual.empresaId).maybeSingle(),
  ]);
  const funilEscolhido = config.funis.find((f) => f.id === funil && f.ativo) ?? config.funis.find((f) => f.ativo);
  if (!funilEscolhido) return <p className="text-sm text-texto-2">Nenhum funil ativo.</p>;
  const etapaEscolhida = config.etapas.find((e) => e.id === etapa && e.funilId === funilEscolhido.id && e.ativa);
  const origens = config.origens.filter((o) => o.ativa);
  const origemSugerida = origens.some((o) => o.id === ultimo?.origem_id) ? ultimo!.origem_id : null;
  const responsaveis = pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) ? config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL)) : [];

  // Eletroposto: só com o módulo ligado na empresa. O SDR também cria, mas sem modelos (quem gera proposta escolhe).
  const eletroposto = !!empresa?.eletroposto_ativo;
  const escolhido = eletroposto ? (tipo === "solar" || tipo === "eletroposto" ? tipo : null) : "solar";
  const parametrosTipo = (t: string) => {
    const p = new URLSearchParams({ tipo: t, funil: funilEscolhido.id });
    if (etapaEscolhida) p.set("etapa", etapaEscolhida.id);
    if (contatoInicial) p.set("contato", contatoInicial.id);
    return `/negocios/novo?${p}`;
  };

  const voltar = (
    <Link href={escolhido && eletroposto ? parametrosTipo("") : "/negocios"} className="sobretitulo self-start hover:text-texto">
      ← {escolhido && eletroposto ? "Tipo de negócio" : "Negócios"}
    </Link>
  );

  if (!escolhido) {
    return (
      <div className="mx-auto flex max-w-[1240px] flex-col">
        <Link href="/negocios" className="sobretitulo self-start hover:text-texto">
          ← Negócios
        </Link>
        <h1 className="mt-2 text-3xl font-light tracking-tight text-texto md:text-4xl">Novo negócio</h1>
        <p className="mt-1 mb-6 max-w-xl text-texto-2 md:mb-8">O que você vai vender?</p>
        <div className="max-w-md">
          <OpcoesTipoNegocio href={parametrosTipo("")} />
        </div>
      </div>
    );
  }

  if (escolhido === "eletroposto") {
    return (
      <div className="mx-auto flex max-w-[1240px] flex-col">
        {voltar}
        <h1 className="mt-2 text-3xl font-light tracking-tight text-texto md:text-4xl">Novo negócio · Eletroposto</h1>
        <p className="mt-1 mb-6 max-w-xl text-texto-2 md:mb-8">Escolha os modelos e informe o cliente. A proposta sai junto com o negócio.</p>
        <FormularioEletroposto
          funilId={funilEscolhido.id}
          etapaId={etapaEscolhida?.id}
          origens={origens}
          origemSugerida={origemSugerida}
          responsaveis={responsaveis}
          meuMembroId={atual.membroId}
          escolheModelos={pode(atual.papel, PROPOSTA_E_CONTRATO)}
          contatoInicial={contatoInicial}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      {voltar}
      <h1 className="mt-2 text-3xl font-light tracking-tight text-texto md:text-4xl">Novo negócio</h1>
      <p className="mt-1 mb-6 max-w-xl text-texto-2 md:mb-8">Três passos. O Raion monta o kit e o cálculo; você confere e cria.</p>
      <FormularioNegocio
        funilId={funilEscolhido.id}
        etapaId={etapaEscolhida?.id}
        origens={origens}
        origemSugerida={origemSugerida}
        responsaveis={responsaveis}
        meuMembroId={atual.membroId}
        contexto={contexto}
        contatoInicial={contatoInicial}
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
    </div>
  );
}
