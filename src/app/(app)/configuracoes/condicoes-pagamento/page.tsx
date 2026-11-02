import { Cartao, Voltar } from "@/components/ui";
import { MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, preferenciasDaEmpresa } from "@/lib/condicoes-pagamento";
import { CONDICOES_PAGAMENTO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioPreferencias, FormularioTaxas } from "./formularios";

/** Condições de pagamento da empresa: admin e gestor definem descontos sem aprovação, Personalizado e parcelas/taxas. */
export default async function CondicoesPagamento() {
  const { atual } = await exigirPapel(...CONDICOES_PAGAMENTO);
  const supabase = await criarClienteServidor();
  const [{ data: preferencias, error: erroPreferencias }, { data: taxas, error: erroTaxas }] = await Promise.all([
    supabase
      .from("condicoes_pagamento_preferencias")
      .select("desconto_max_vendedor, desconto_max_gestor, personalizado_ativo")
      .eq("empresa_id", atual.empresaId)
      .maybeSingle(),
    supabase.from("taxas_parcelamento").select("meio, parcelas, taxa_percentual").eq("empresa_id", atual.empresaId).order("parcelas"),
  ]);
  if (erroPreferencias) throw erroPreferencias;
  if (erroTaxas) throw erroTaxas;

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela proposta na ficha do negócio (o hub de Configurações é só do admin). */}
      {atual.papel === "admin" ? <Voltar href="/configuracoes">Configurações</Voltar> : <Voltar href="/negocios">Negócios</Voltar>}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Condições de pagamento</h1>
        <p className="text-sm text-texto-2">
          O que o vendedor pode oferecer na proposta: desconto à vista, parcelamento no cartão e no boleto, financiamento e acordos personalizados.
          Mudanças valem para as próximas propostas; as já emitidas não mudam.
        </p>
      </header>
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
    </div>
  );
}
