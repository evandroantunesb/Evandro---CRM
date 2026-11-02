import "server-only";
import { opcoesDeEscolha, type OpcaoEscolha } from "@/lib/condicao-escolhida";
import { MEIOS_PARCELAMENTO, preferenciasDaEmpresa, valorNegocioDaEmpresa } from "@/lib/condicoes-pagamento";
import type { RegrasCondicoes } from "@/lib/condicoes-pagamento-proposta";
import { lerDadosDaEmissao } from "@/lib/propostas/proposta-simples";
import type { criarClienteServidor } from "@/lib/supabase/server";

/**
 * O que a empresa permite a quem está logado nas condições de pagamento da proposta deste negócio: Personalizado,
 * parcelas e taxas (PR 1), o limite de desconto de quem emite e o maior desconto já aprovado no negócio (PR 2). A ficha
 * mostra a partir daqui e a emissão confere de novo a partir daqui. Nulo = não foi possível ler.
 */
export async function carregarRegrasCondicoes(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  empresaId: string,
  negocioId: string,
): Promise<RegrasCondicoes | null> {
  const [preferenciasR, taxasR, limiteR, aprovadoR] = await Promise.all([
    supabase.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor, desconto_max_gestor, personalizado_ativo").eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("taxas_parcelamento").select("meio, parcelas, taxa_percentual").eq("empresa_id", empresaId).order("parcelas"),
    supabase.rpc("meu_limite_desconto", { p_empresa_id: empresaId }),
    supabase
      .from("descontos_solicitacoes")
      .select("percentual")
      .eq("negocio_id", negocioId)
      .eq("status", "aprovado")
      .order("percentual", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (preferenciasR.error || taxasR.error || limiteR.error || aprovadoR.error) return null;
  const taxas = Object.fromEntries(
    MEIOS_PARCELAMENTO.map((meio) => [
      meio,
      (taxasR.data ?? []).filter((t) => t.meio === meio).map((t) => ({ parcelas: t.parcelas, taxa: Number(t.taxa_percentual) })),
    ]),
  ) as RegrasCondicoes["taxas"];
  return {
    personalizadoAtivo: preferenciasDaEmpresa(preferenciasR.data).personalizadoAtivo,
    taxas,
    limiteDesconto: Number(limiteR.data ?? 0),
    descontoAprovado: Number(aprovadoR.data?.percentual ?? 0),
  };
}

export type EscolhaCondicao = {
  emissao: { id: string; versao: number; validadeAte: string; preco: number };
  opcoes: OpcaoEscolha[];
};

/**
 * O que o vendedor pode registrar como condição escolhida: as opções da ÚLTIMA proposta emitida do negócio, se ela for
 * do esquema 5 (por modalidade), estiver íntegra e dentro da validade; nulo = sem escolha (o contrato segue como
 * antes). `erro` = não foi possível ler.
 */
export async function carregarEscolhaCondicao(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  empresaId: string,
  negocioId: string,
  hoje: string,
): Promise<{ escolha: EscolhaCondicao | null; erro: boolean }> {
  const [emissaoR, preferenciasR] = await Promise.all([
    supabase
      .from("propostas_emissoes")
      .select("id, versao, dados, dados_sha256")
      .eq("negocio_id", negocioId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("condicoes_pagamento_preferencias")
      .select("valor_negocio_avista, valor_negocio_parcelado, valor_negocio_financiamento, valor_negocio_personalizado")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  if (emissaoR.error || preferenciasR.error) return { escolha: null, erro: true };
  if (!emissaoR.data) return { escolha: null, erro: false };
  const lida = lerDadosDaEmissao(emissaoR.data.dados, emissaoR.data.dados_sha256);
  if (!lida.ok || lida.dados.esquema !== 5 || lida.dados.comercial.validadeAte < hoje) return { escolha: null, erro: false };
  const preco = lida.dados.preco.valor;
  return {
    escolha: {
      emissao: { id: emissaoR.data.id, versao: emissaoR.data.versao, validadeAte: lida.dados.comercial.validadeAte, preco },
      opcoes: opcoesDeEscolha(lida.dados.comercial.condicoesPagamento, preco, valorNegocioDaEmpresa(preferenciasR.data)),
    },
    erro: false,
  };
}
