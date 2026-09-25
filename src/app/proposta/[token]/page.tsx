import { notFound } from "next/navigation";
import { LogoRaion } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ROTULO_TIPO_LIGACAO, type ModoPreco, type TipoLigacao } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Página pública da proposta: o cliente abre pelo link, sem login. */
export default async function PropostaPublica({ params }: PageProps<"/proposta/[token]">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: proposta } = await admin
    .from("propostas")
    .select(
      "id, negocio_id, modo_preco, mensagem, mostrar_sistema, mostrar_economia, negocios(titulo, contatos(nome, endereco, cidade, uf))",
    )
    .eq("token", token)
    .maybeSingle();
  if (!proposta) notFound();

  const negocio = proposta.negocios as unknown as {
    titulo: string;
    contatos: { nome: string; endereco: string | null; cidade: string | null; uf: string | null } | null;
  } | null;
  const contato = negocio?.contatos;

  const { data: calculo } = await admin
    .from("calculos_solares")
    .select(
      "kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses, conta_sem_solar, conta_com_solar",
    )
    .eq("negocio_id", proposta.negocio_id)
    .maybeSingle();

  // Registra a abertura (não bloqueia a renderização caso falhe).
  await admin.from("propostas_aberturas").insert({ proposta_id: proposta.id });

  if (!calculo || !contato) notFound();

  const modoPreco = proposta.modo_preco as ModoPreco;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <LogoRaion altura={32} />
      <div>
        <p className="text-xs font-medium tracking-[0.3em] text-zinc-500 uppercase">Proposta de energia solar</p>
        <h1 className="mt-1 text-2xl font-semibold text-carvao">{contato.nome}</h1>
        {(contato.endereco || contato.cidade) && (
          <p className="text-sm text-zinc-600">{[contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      {proposta.mensagem && <p className="text-sm whitespace-pre-wrap text-zinc-700">{proposta.mensagem}</p>}

      {proposta.mostrar_sistema && (
        <Cartao titulo="O sistema">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Kit</dt>
              <dd className="font-medium text-zinc-900">{calculo.kit_nome}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Potência</dt>
              <dd className="font-medium text-zinc-900">{calculo.kit_potencia_kwp.toLocaleString("pt-BR")} kWp</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Ligação</dt>
              <dd>{ROTULO_TIPO_LIGACAO[calculo.tipo_ligacao as TipoLigacao]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Geração estimada</dt>
              <dd>{calculo.geracao_estimada_kwh_mes.toLocaleString("pt-BR")} kWh/mês</dd>
            </div>
          </dl>
        </Cartao>
      )}

      {proposta.mostrar_economia && (
        <Cartao titulo="Sua economia">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Conta hoje</dt>
              <dd className="font-medium text-zinc-900">{formatarMoeda(calculo.conta_sem_solar)}/mês</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Conta com o sistema</dt>
              <dd className="font-medium text-zinc-900">{formatarMoeda(calculo.conta_com_solar)}/mês</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Economia estimada</dt>
              <dd className="font-medium text-green-700">{formatarMoeda(calculo.economia_mensal)}/mês</dd>
            </div>
            {modoPreco !== "sem_preco" && calculo.payback_meses != null && (
              <div>
                <dt className="text-zinc-500">Retorno do investimento</dt>
                <dd className="font-medium text-zinc-900">{calculo.payback_meses.toLocaleString("pt-BR")} meses</dd>
              </div>
            )}
          </dl>
        </Cartao>
      )}

      {modoPreco !== "sem_preco" && (
        <Cartao titulo="Investimento">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {(modoPreco === "avista" || modoPreco === "completo") && (
              <div>
                <dt className="text-zinc-500">À vista</dt>
                <dd className="font-medium text-zinc-900">{formatarMoeda(calculo.kit_preco)}</dd>
              </div>
            )}
            {(modoPreco === "parcelado" || modoPreco === "completo") && (
              <div>
                <dt className="text-zinc-500">Parcelado</dt>
                <dd className="font-medium text-zinc-900">Consulte condições com o vendedor</dd>
              </div>
            )}
          </dl>
        </Cartao>
      )}

      <p className="text-xs text-zinc-400">
        Estimativa do modo comercial (sem simulação de engenharia). Os valores podem variar após a visita técnica.
      </p>
    </main>
  );
}
