import { CartaoFaixa } from "@/app/(app)/configuracoes/tela-entrada/cartao-faixa";
import { FormularioTelaEntrada } from "@/app/(app)/configuracoes/tela-entrada/formulario";
import type { ChavePasso } from "@/lib/assistente";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarImagensParaEditar } from "@/lib/tela-entrada-servidor";
import { BotaoContinuar } from "./botao";
import { PassoEmpresa } from "./empresa";
import { PassoMarca } from "./marca";

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

  const ultimo = props.chave === "revisar";
  return (
    <form action={ultimo ? props.concluir : props.continuar}>
      <BotaoContinuar rotulo={ultimo ? "Começar a usar o Raion" : "Continuar"} />
    </form>
  );
}
