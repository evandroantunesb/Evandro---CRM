import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioCondicoes } from "./formulario";

/** Prazo de validade e formas de pagamento da proposta simples (D1/D2): gestor e admin configuram. */
export default async function ConfigCondicoesProposta() {
  const { atual } = await exigirPapel("admin", "gestor");
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("proposta_condicoes_comerciais")
    .select("validade_dias, pagamento_avista, pagamento_cartao, pagamento_financiamento")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Condições da proposta</h1>
      <Cartao titulo="Validade e formas de pagamento">
        <p className="mb-3 text-sm text-zinc-600">
          Valem para as próximas propostas emitidas. A data de vencimento é calculada na emissão (dia da emissão + prazo). Propostas já
          emitidas não mudam.
        </p>
        <FormularioCondicoes
          inicial={{
            validadeDias: data?.validade_dias ?? null,
            avista: data?.pagamento_avista ?? "",
            cartao: data?.pagamento_cartao ?? "",
            financiamento: data?.pagamento_financiamento ?? "",
          }}
        />
      </Cartao>
    </div>
  );
}
