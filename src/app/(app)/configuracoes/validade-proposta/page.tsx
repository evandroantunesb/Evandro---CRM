import { Voltar } from "@/components/ui";
import { VALIDADE_PADRAO_PROPOSTA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormValidade } from "./form-validade";

/** Fora do hub de Configurações (admin só): o gestor também define a validade padrão da proposta. */
export default async function ValidadePadraoProposta() {
  const { atual } = await exigirPapel(...VALIDADE_PADRAO_PROPOSTA);
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("proposta_preferencias").select("validade_dias").eq("empresa_id", atual.empresaId).maybeSingle();

  return (
    <div className="mx-auto flex max-w-xl animate-entrar flex-col gap-6">
      {atual.papel === "admin" ? (
        <Voltar href="/configuracoes/propostas">Propostas comerciais</Voltar>
      ) : (
        <Voltar href="/negocios">Negócios</Voltar>
      )}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Validade padrão da proposta</h1>
      </header>
      <FormValidade validadeDias={data?.validade_dias ?? null} />
    </div>
  );
}
