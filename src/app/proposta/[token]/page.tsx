import { notFound } from "next/navigation";
import { LogoRaion } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { linkSolicitarNovaProposta, MENSAGEM_EMISSAO_INTEGRIDADE, situacaoDaEmissao } from "@/lib/propostas/emissao-preservada";
import { lerEmissaoPorToken } from "@/lib/propostas/emissoes-gravacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PropostaEmitida } from "./emitida";
import { ROTULO_TIPO_LIGACAO, type ModoPreco, type TipoLigacao } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Página pública da proposta: o cliente abre pelo link, sem login. */
export default async function PropostaPublica({ params }: PageProps<"/proposta/[token]">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  // Proposta emitida (com dados e PDF preservados): exibe só o que foi gravado na emissão. A página só aparece se os
  // dados E o PDF gravado conferem (hash e tamanho): linha sem PDF íntegro nunca é mostrada.
  const emitida = await lerEmissaoPorToken(admin, token);
  if (emitida.ok || emitida.motivo === "integridade") {
    if (!emitida.ok) {
      return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
          <LogoRaion altura={32} />
          <div role="status" data-testid="proposta-indisponivel" className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {MENSAGEM_EMISSAO_INTEGRIDADE}
          </div>
        </main>
      );
    }
    return <PropostaEmitida token={token} dados={emitida.dados} />;
  }

  const { data: proposta } = await admin
    .from("propostas")
    .select(
      "id, empresa_id, negocio_id, created_at, modo_preco, mensagem, mostrar_sistema, mostrar_economia, negocios(titulo, contatos(nome, endereco, cidade, uf))",
    )
    .eq("token", token)
    .maybeSingle();
  if (!proposta) notFound();

  const negocio = proposta.negocios as unknown as {
    titulo: string;
    contatos: { nome: string; endereco: string | null; cidade: string | null; uf: string | null } | null;
  } | null;
  const contato = negocio?.contatos;

  // Registra a abertura (não bloqueia a renderização caso falhe).
  await admin.from("propostas_aberturas").insert({ proposta_id: proposta.id });

  if (!contato) notFound();

  // Os dados da emissão (sistema, economia, preço) não foram preservados: o link continua válido, mas a página não
  // mostra números lidos ao vivo (podem não ser os que o cliente recebeu). Mesma mensagem do PDF (409).
  const situacao = situacaoDaEmissao(proposta);
  if (!situacao.disponivel) {
    const { data: identidade } = await admin.from("proposta_identidades").select("whatsapp").eq("empresa_id", proposta.empresa_id).maybeSingle();
    const novaProposta = linkSolicitarNovaProposta(identidade?.whatsapp, contato.nome);
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
        <div
          role="status"
          data-testid="proposta-indisponivel"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
        >
          {situacao.mensagem}
        </div>
        {novaProposta ? (
          <a
            href={novaProposta}
            target="_blank"
            rel="noreferrer"
            data-testid="solicitar-nova-proposta"
            className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-carvao hover:border-dourado"
          >
            Solicitar uma nova proposta
          </a>
        ) : (
          <p className="text-sm text-zinc-600">Para receber uma nova proposta, fale com o seu vendedor.</p>
        )}
      </main>
    );
  }

  // Ponto de extensão: só chega aqui quando a emissão tiver dados preservados (hoje, nunca).
  const { data: calculo } = await admin
    .from("calculos_solares")
    .select(
      "kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses, conta_sem_solar, conta_com_solar",
    )
    .eq("negocio_id", proposta.negocio_id)
    .maybeSingle();
  if (!calculo) notFound();

  const modoPreco = proposta.modo_preco as ModoPreco;
  // Economia nula (resultado técnico incompleto) nunca vira número: conta como "sem economia".
  const semEconomia = calculo.economia_mensal == null || !(calculo.economia_mensal > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <LogoRaion altura={32} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.3em] text-zinc-500 uppercase">Proposta de energia solar</p>
          <h1 className="mt-1 text-2xl font-semibold text-carvao">{contato.nome}</h1>
          {(contato.endereco || contato.cidade) && (
            <p className="text-sm text-zinc-600">{[contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <a
          href={`/proposta/${token}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-carvao hover:border-dourado"
        >
          Baixar PDF
        </a>
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
              <dd className={semEconomia ? "font-medium text-zinc-700" : "font-medium text-green-700"}>
                {semEconomia ? "Sem economia estimada neste cenário" : `${formatarMoeda(calculo.economia_mensal)}/mês`}
              </dd>
            </div>
            {modoPreco !== "sem_preco" && (
              <div>
                <dt className="text-zinc-500">Retorno do investimento</dt>
                <dd className="font-medium text-zinc-900">
                  {semEconomia || calculo.payback_meses == null || !(calculo.payback_meses > 0)
                    ? "indisponível"
                    : `${calculo.payback_meses.toLocaleString("pt-BR")} meses`}
                </dd>
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
