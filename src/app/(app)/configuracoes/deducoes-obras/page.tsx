import { Cartao, Voltar } from "@/components/ui";
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
      {atual.papel === "admin" ? <Voltar href="/configuracoes">Configurações</Voltar> : <Voltar href="/obras">Obras</Voltar>}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Impostos e comissões</h1>
        <p className="text-sm text-texto-2">
          Quanto da venda sai para impostos e comissões no lucro líquido previsto das obras. Vale com o valor atual para todas as obras.
        </p>
      </header>
      <Cartao titulo="Percentuais sobre a venda">
        <FormularioDeducoes impostos={Number(data?.impostos_percentual ?? 0)} comissoes={Number(data?.comissoes_percentual ?? 0)} />
      </Cartao>
    </div>
  );
}
