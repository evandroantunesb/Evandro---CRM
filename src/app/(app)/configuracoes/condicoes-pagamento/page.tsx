import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, preferenciasDaEmpresa, valorNegocioDaEmpresa } from "@/lib/condicoes-pagamento";
import { CONDICOES_PAGAMENTO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioPreferencias, FormularioTaxas, FormularioValorNegocio } from "./formularios";

/** Condições de pagamento da empresa: admin e gestor definem descontos sem aprovação, Personalizado e parcelas/taxas. */
export default async function CondicoesPagamento() {
  const { atual } = await exigirPapel(...CONDICOES_PAGAMENTO);
  const supabase = await criarClienteServidor();
  const [{ data: preferencias, error: erroPreferencias }, { data: taxas, error: erroTaxas }] = await Promise.all([
    supabase
      .from("condicoes_pagamento_preferencias")
      .select(
        "desconto_max_vendedor, desconto_max_gestor, personalizado_ativo, valor_negocio_avista, valor_negocio_parcelado, valor_negocio_financiamento, valor_negocio_personalizado",
      )
      .eq("empresa_id", atual.empresaId)
      .maybeSingle(),
    supabase.from("taxas_parcelamento").select("meio, parcelas, taxa_percentual").eq("empresa_id", atual.empresaId).order("parcelas"),
  ]);
  if (erroPreferencias) throw erroPreferencias;
  if (erroTaxas) throw erroTaxas;

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela proposta na ficha do negócio (o hub de Configurações é só do admin). */}
      <CabecalhoPagina
        detalhe
        voltar={atual.papel === "admin" ? { href: "/configuracoes", rotulo: "Configurações" } : { href: "/negocios", rotulo: "Negócios" }}
        sobretitulo="Configurações · Venda"
        titulo="Condições de pagamento"
        descricao="Descontos, parcelas e taxas do cartão e do boleto."
      />
      <p className="text-sm text-texto-2">
        O que o vendedor pode oferecer na proposta: desconto à vista, parcelamento no cartão e no boleto, financiamento e acordos personalizados.
        Mudanças valem para as próximas propostas; as já emitidas não mudam.
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
      <Cartao titulo="Valor do negócio pela condição escolhida">
        <FormularioValorNegocio valores={valorNegocioDaEmpresa(preferencias)} />
      </Cartao>
    </div>
  );
}
