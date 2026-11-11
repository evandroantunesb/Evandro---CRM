import { CartaoFaixa } from "@/app/(app)/configuracoes/tela-entrada/cartao-faixa";
import { FormularioTelaEntrada } from "@/app/(app)/configuracoes/tela-entrada/formulario";
import { FormularioPreferencias, FormularioTaxas } from "@/app/(app)/configuracoes/condicoes-pagamento/formularios";
import { FormularioTelas } from "@/app/(app)/configuracoes/telas/formulario";
import { PainelPessoa } from "@/app/(app)/configuracoes/usuarios/formularios";
import { Cartao } from "@/components/ui";
import type { ChavePasso, DadosRevisao } from "@/lib/assistente";
import { MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, preferenciasDaEmpresa } from "@/lib/condicoes-pagamento";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";
import { TELAS_OPCIONAIS } from "@/lib/telas-empresa";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";
import { carregarImagensParaEditar } from "@/lib/tela-entrada-servidor";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";
import { BotaoContinuar } from "./botao";
import { PassoEmpresa } from "./empresa";
import { PassoMarca } from "./marca";
import { PassoRevisar } from "./revisar";

export type PropsPasso = {
  chave: ChavePasso;
  empresaId: string;
  nomeEmpresa: string;
  rever: boolean;
  passos: ChavePasso[];
  estados: Record<ChavePasso, "feito" | "pulado" | "pendente">;
  /** Grava a posição e leva ao próximo passo (depois de o passo salvar o que é dele). */
  continuar: () => Promise<void>;
  /** "Começar a usar o Raion" (último passo). */
  concluir: () => Promise<void>;
};

const EXPIRA_SEGUNDOS = 3600;

/** Conteúdo de cada passo: carrega o que o passo mostra e grava pelas mesmas ações de Configurações. */
export async function ConteudoDoPasso(props: PropsPasso) {
  const supabase = await criarClienteServidor();

  if (props.chave === "empresa") {
    const [{ data: identidade }, { data: empresa }] = await Promise.all([
      supabase.from("proposta_identidades").select("nome_exibicao, whatsapp").eq("empresa_id", props.empresaId).maybeSingle(),
      supabase.from("empresas").select("nome, cnpj").eq("id", props.empresaId).maybeSingle(),
    ]);
    return (
      <PassoEmpresa
        inicial={{ nome: identidade?.nome_exibicao || empresa?.nome || "", cnpj: empresa?.cnpj ?? "", whatsapp: identidade?.whatsapp ?? "" }}
        continuar={props.continuar}
      />
    );
  }

  if (props.chave === "marca") {
    const { data: identidade } = await supabase
      .from("proposta_identidades")
      .select("cor_primaria, cor_destaque, logo_escuro_url")
      .eq("empresa_id", props.empresaId)
      .maybeSingle();
    const logo = identidade?.logo_escuro_url
      ? ((await supabase.storage.from("proposta-marca").createSignedUrl(identidade.logo_escuro_url, EXPIRA_SEGUNDOS)).data?.signedUrl ?? null)
      : null;
    return (
      <PassoMarca
        empresaId={props.empresaId}
        nomeEmpresa={props.nomeEmpresa}
        logoEscuroCaminho={identidade?.logo_escuro_url ?? null}
        logoEscuroUrl={logo}
        cores={{ corPrimaria: identidade?.cor_primaria ?? "", corDestaque: identidade?.cor_destaque ?? "" }}
        continuar={props.continuar}
      />
    );
  }

  if (props.chave === "imagens") {
    const imagens = await carregarImagensParaEditar(supabase, props.empresaId);
    return (
      <div className="flex flex-col gap-5">
        <p className="max-w-2xl text-sm text-texto-2">
          A foto do login e a foto da faixa escura no topo de cada tela. Pode ser a mesma ou duas diferentes. Sem foto, fica a paisagem padrão do Raion.
        </p>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <FormularioTelaEntrada empresaId={props.empresaId} {...imagens.formulario} />
          <CartaoFaixa empresaId={props.empresaId} {...imagens.faixa} />
        </div>
        <form action={props.continuar}>
          <BotaoContinuar />
        </form>
      </div>
    );
  }

  if (props.chave === "telas") {
    const [telas, { data: empresa }] = await Promise.all([
      obterTelasEmpresa(),
      supabase.from("empresas").select("eletroposto_ativo").eq("id", props.empresaId).maybeSingle(),
    ]);
    return (
      <div className="flex flex-col gap-5">
        <p className="max-w-2xl text-sm text-texto-2">
          Início, Tarefas, Negócios, Contatos e Propostas e contratos ficam sempre ligados. Uma tela desligada some do menu de todo mundo, e os dados dela
          continuam guardados.
        </p>
        <FormularioTelas ligadasIniciais={TELAS_OPCIONAIS.filter((t) => telas.ligadas.has(t))} eletropostoLiberado={!!empresa?.eletroposto_ativo} />
        <form action={props.continuar}>
          <BotaoContinuar />
        </form>
      </div>
    );
  }

  if (props.chave === "pagamento") {
    const [{ data: preferencias }, { data: taxas }] = await Promise.all([
      supabase.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor, desconto_max_gestor, personalizado_ativo").eq("empresa_id", props.empresaId).maybeSingle(),
      supabase.from("taxas_parcelamento").select("meio, parcelas, taxa_percentual").eq("empresa_id", props.empresaId).order("parcelas"),
    ]);
    return (
      <div className="flex flex-col gap-5">
        <p className="max-w-2xl text-sm text-texto-2">
          O que o vendedor pode oferecer na proposta. Dá para ajustar valores e parcelas depois em Configurações › Condições de pagamento.
        </p>
        <Cartao titulo="Descontos e Personalizado">
          <FormularioPreferencias preferencias={preferenciasDaEmpresa(preferencias)} />
        </Cartao>
        {MEIOS_PARCELAMENTO.map((meio) => (
          <Cartao key={meio} titulo={`Parcelamento no ${ROTULO_MEIO_PARCELAMENTO[meio].toLowerCase()}`}>
            <FormularioTaxas
              meio={meio}
              taxas={(taxas ?? []).filter((t) => t.meio === meio).map((t) => ({ parcelas: t.parcelas, taxa: Number(t.taxa_percentual) }))}
            />
          </Cartao>
        ))}
        <form action={props.continuar}>
          <BotaoContinuar />
        </form>
      </div>
    );
  }

  if (props.chave === "equipe") {
    const { data: membros } = await supabase
      .from("empresa_membros")
      .select("id, papel, perfis(nome, email)")
      .eq("empresa_id", props.empresaId)
      .eq("ativo", true)
      .order("created_at");
    return (
      <div className="flex flex-col gap-5">
        <p className="max-w-2xl text-sm text-texto-2">
          Cadastre as pessoas agora ou depois, em Configurações › Usuários. Cada uma recebe uma senha temporária para você repassar.
        </p>
        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          <PainelPessoa membro={null} fecharHref={`/primeiro-acesso?passo=equipe${props.rever ? "&rever=1" : ""}`} />
          <section className="painel flex flex-col gap-2 p-5">
            <h2 className="font-titulo text-[17px] font-semibold">Na equipe</h2>
            <ul className="flex flex-col divide-y divide-linha text-sm">
              {(membros ?? []).map((m) => {
                const perfil = m.perfis as unknown as { nome: string | null; email: string } | null;
                return (
                  <li key={m.id} className="py-2">
                    <b className="block text-texto">{perfil?.nome || perfil?.email}</b>
                    <span className="text-xs text-texto-2">{ROTULO_PAPEL[m.papel as Papel] ?? m.papel}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <form action={props.continuar}>
          <BotaoContinuar />
        </form>
      </div>
    );
  }

  return <PassoRevisar passos={props.passos} estados={props.estados} dados={await carregarRevisao(supabase, props.empresaId)} rever={props.rever} concluir={props.concluir} />;
}

/** Dados do resumo da revisão: o que ficou gravado em cada configuração. */
async function carregarRevisao(supabase: SupabaseServidor, empresaId: string): Promise<DadosRevisao> {
  const [{ data: identidade }, { data: empresa }, { data: tela }, telas, { data: preferencias }, { data: taxas }, { count: pessoas }] = await Promise.all([
    supabase.from("proposta_identidades").select("nome_exibicao, whatsapp, cor_primaria, cor_destaque, logo_escuro_url").eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("empresas").select("nome, cnpj, eletroposto_ativo").eq("id", empresaId).maybeSingle(),
    supabase.from("empresa_tela_entrada").select("imagem_caminho, faixa_caminho, faixa_usa_entrada").eq("empresa_id", empresaId).maybeSingle(),
    obterTelasEmpresa(),
    supabase.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor, desconto_max_gestor, personalizado_ativo").eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("taxas_parcelamento").select("parcelas").eq("empresa_id", empresaId).eq("meio", "cartao"),
    supabase.from("empresa_membros").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("ativo", true),
  ]);
  const pref = preferenciasDaEmpresa(preferencias);
  return {
    empresa: { nome: identidade?.nome_exibicao || empresa?.nome || null, cnpj: empresa?.cnpj ?? null, whatsapp: identidade?.whatsapp ?? null },
    marca: { temLogo: !!identidade?.logo_escuro_url, temCores: !!(identidade?.cor_primaria || identidade?.cor_destaque) },
    imagens: { fotoEntrada: !!tela?.imagem_caminho, faixaPropria: !!tela && !tela.faixa_usa_entrada && !!tela.faixa_caminho },
    telas: { ligadas: telas.ligadas.size, eletropostoLiberado: !!empresa?.eletroposto_ativo, eletropostoLigado: telas.ligadas.has("eletroposto") },
    pagamento: { descontoVendedor: pref.descontoMaxVendedor, parcelasCartao: Math.max(0, ...(taxas ?? []).map((t) => t.parcelas)), personalizado: pref.personalizadoAtivo },
    // Quem está fazendo o assistente não conta.
    equipe: { pessoas: Math.max(0, (pessoas ?? 1) - 1) },
  };
}
