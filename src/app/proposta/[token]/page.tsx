import { notFound } from "next/navigation";
import { LogoRaion } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { montarDadosSistemaProposta } from "@/lib/propostas/pdf-dados";
import type { BlocoRenderizavel, IdentidadeProposta } from "@/lib/propostas/pdf-tipos";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ROTULO_TIPO_LIGACAO, type ModoPreco, type TipoLigacao } from "@/lib/tipos";
import { ModeloPaginaBlocos } from "./pagina-blocos";

export const dynamic = "force-dynamic";

/** Página pública da proposta: o cliente abre pelo link, sem login. */
export default async function PropostaPublica({ params }: PageProps<"/proposta/[token]">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: proposta } = await admin
    .from("propostas")
    .select(
      "id, empresa_id, negocio_id, modo_preco, mensagem, modelo_id, capa_variante, blocos_emitidos, negocios(titulo, contatos(nome, endereco, cidade, uf))",
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

  // Proposta emitida com um modelo do construtor: mostra os mesmos blocos
  // configurados (igual ao PDF novo). Sem modelo (proposta antiga, ou
  // empresa que ainda não montou nenhum modelo): mantém o layout fixo de sempre.
  if (proposta.modelo_id && proposta.blocos_emitidos && proposta.capa_variante) {
    const [{ data: componentesData }, { data: identidadeData }] = await Promise.all([
      admin.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", proposta.negocio_id).order("ordem"),
      admin.from("proposta_identidades").select("nome_exibicao, cor_primaria, cor_destaque, whatsapp, rodape_texto").eq("empresa_id", proposta.empresa_id).maybeSingle(),
    ]);

    const dados = montarDadosSistemaProposta({ contato, calculo, modoPreco, componentes: componentesData ?? [] });

    const blocosEmitidos = proposta.blocos_emitidos as unknown as {
      tipo: string;
      ordem: number;
      ativo: boolean;
      quebra_pagina: "auto" | "nova_pagina" | "pagina_exclusiva";
      config: unknown;
    }[];
    const blocos: BlocoRenderizavel[] = blocosEmitidos.map((b) => ({
      tipo: b.tipo as BlocoRenderizavel["tipo"],
      ordem: b.ordem,
      ativo: b.ativo,
      quebraPagina: b.quebra_pagina,
      config: b.config,
    }));
    const identidade: IdentidadeProposta = {
      nomeExibicao: identidadeData?.nome_exibicao ?? "",
      corPrimaria: identidadeData?.cor_primaria ?? "",
      corDestaque: identidadeData?.cor_destaque ?? "",
      whatsapp: identidadeData?.whatsapp ?? "",
      rodapeTexto: identidadeData?.rodape_texto ?? "",
      logoUrl: null,
      logoEscuroUrl: null,
      fotoCapaUrl: null,
    };

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

        <ModeloPaginaBlocos blocos={blocos} identidade={identidade} dados={dados} />

        {identidade.rodapeTexto && <p className="text-xs text-zinc-400">{identidade.rodapeTexto}</p>}
      </main>
    );
  }

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
