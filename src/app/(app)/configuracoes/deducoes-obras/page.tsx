import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { FINANCEIRO_OBRA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioDeducoes } from "./formulario";

/** Deduções do lucro das obras (OPR): admin e gestor definem os percentuais de impostos e comissões sobre a venda. */
export default async function DeducoesObras() {
  const { atual } = await exigirPapel(...FINANCEIRO_OBRA);
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("obra_deducoes").select("impostos_percentual, comissoes_percentual").eq("empresa_id", atual.empresaId).maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela ficha da obra (o hub de Configurações é só do admin). */}
      <CabecalhoPagina
        detalhe
        voltar={atual.papel === "admin" ? { href: "/configuracoes", rotulo: "Configurações" } : { href: "/obras", rotulo: "Obras" }}
        sobretitulo="Configurações · Obras"
        titulo="Impostos e comissões"
        descricao="Percentuais da venda descontados no lucro das obras."
      />
      <p className="text-sm text-texto-2">
        Quanto da venda sai para impostos e comissões no lucro líquido previsto das obras. Vale com o valor atual para todas as obras.
      </p>
      <Cartao titulo="Percentuais sobre a venda">
        <FormularioDeducoes impostos={Number(data?.impostos_percentual ?? 0)} comissoes={Number(data?.comissoes_percentual ?? 0)} />
      </Cartao>
    </div>
  );
}
