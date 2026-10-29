import { Cartao, Voltar } from "@/components/ui";
import { formatarDataHora } from "@/lib/crm";
import { VALIDADE_PROPOSTA } from "@/lib/permissoes";
import { validadePadraoDaEmpresa } from "@/lib/propostas/proposta-simples";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioValidade } from "./formulario";

/** Validade padrão da proposta: admin e gestor definem quantos dias a data "Válida até" já vem preenchida na emissão. */
export default async function ValidadeProposta() {
  const { atual } = await exigirPapel(...VALIDADE_PROPOSTA);
  const supabase = await criarClienteServidor();
  const [{ data: preferencia }, { data: modeloPadrao }] = await Promise.all([
    supabase
      .from("proposta_preferencias")
      .select("validade_dias, updated_at")
      .eq("empresa_id", atual.empresaId)
      .maybeSingle(),
    supabase
      .from("proposta_modelos")
      .select("proposta_modelo_blocos(tipo, config)")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "publicado")
      .eq("padrao", true)
      .maybeSingle(),
  ]);
  const validadeDias = validadePadraoDaEmpresa(preferencia?.validade_dias, modeloPadrao?.proposta_modelo_blocos);

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela proposta na ficha do negócio (o hub de Configurações é só do admin). */}
      {atual.papel === "admin" ? <Voltar href="/configuracoes">Configurações</Voltar> : <Voltar href="/negocios">Negócios</Voltar>}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Validade da proposta</h1>
        <p className="text-sm text-texto-2">
          Quantos dias a proposta vale a partir da emissão. A data &ldquo;Válida até&rdquo; já vem preenchida com esse prazo, e o vendedor ainda
          pode mudar em cada proposta. Propostas já emitidas não mudam.
        </p>
        {preferencia && (
          <p className="text-xs text-texto-2">
            Última alteração em {formatarDataHora(preferencia.updated_at)}.
          </p>
        )}
      </header>
      <Cartao titulo="Prazo padrão">
        <FormularioValidade validadeDias={validadeDias} />
      </Cartao>
    </div>
  );
}
