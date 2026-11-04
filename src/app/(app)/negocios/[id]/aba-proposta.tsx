import { Cartao } from "@/components/ui";
import { env } from "@/lib/env";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import type { ComponentProps } from "react";
import { carregarUltimoAviso } from "@/lib/avisos-pagamento";
import { pastaComprovante } from "@/lib/avisos-pagamento-regras";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  CONFIRMAR_PAGAMENTO,
  CORRIGIR_VALOR_GANHO,
  INFORMAR_PAGAMENTO,
  PAGAMENTO_SOLO,
  PROPOSTA_E_CONTRATO,
  VALIDADE_PROPOSTA,
  pode,
} from "@/lib/permissoes";
import { type ModoPreco, type StatusContrato, type StatusPagamentoContrato } from "@/lib/tipos";
import { Contrato } from "./contrato";
import { DescontoNegocio } from "./desconto";
import { DadosCliente } from "./dados-cliente";
import { mensagemPendenciasContrato } from "@/lib/dados-cliente-contrato";
import { EletropostoNegocio } from "./eletroposto";
import { normalizarModelos, type ModeloEletroposto } from "@/lib/eletroposto";
import { Pagamento } from "./pagamento";
import { PagamentoSolo } from "./pagamento-solo";
import { EmitirProposta } from "./emitir-proposta";
import { Proposta } from "./proposta";
import type { Ficha } from "./dados-ficha";

/** Aba Proposta e contrato (ou Eletroposto): proposta, dados do cliente, contrato e pagamento, com as âncoras dos marcos. */
export function AbaProposta({ ficha }: { ficha: Ficha }) {
  const {
    atual,
    negocio,
    contato,
    nomes,
    arquivado,
    souAdmin,
    ehEletroposto,
    eletroposto,
    emissoesAusente,
    emissoes,
    validadePadraoDias,
    conteudoModelo,
    regrasCondicoes,
    geracaoConfirmada,
    bloqueioEmissao,
    proposta,
    precoDesatualizado,
    precoContratoDesatualizado,
    escolhaCondicao,
    condicaoRegistrada,
    bloqueioProposta,
    modelosProposta,
    aberturas,
    contrato,
    pendenciasCliente,
    bloqueioContrato,
    mostrarPagamentoSolo,
    mostrarPagamentoPro,
    registroManualIndisponivel,
    situacaoPagamentoSolo,
    statusPagamento,
    registrosPagamento,
    desconto,
  } = ficha;
  return ehEletroposto ? (
    <div id="proposta" className="scroll-mt-4">
      <Cartao titulo="Eletroposto">
        <EletropostoNegocio
          negocioId={negocio.id}
          siteUrl={env.siteUrl}
          telefoneCliente={contato.telefone}
          podeEditar={!arquivado}
          escolheModelos={pode(atual.papel, PROPOSTA_E_CONTRATO)}
          registro={
            eletroposto
              ? {
                  token: eletroposto.token,
                  modelos: normalizarModelos(eletroposto.modelos),
                  precos: eletroposto.precos as Partial<Record<ModeloEletroposto, number>>,
                  localProprio: eletroposto.local_proprio,
                  usinaFv: eletroposto.usina_fv,
                  emitidaEm: eletroposto.emitida_em,
                }
              : null
          }
        />
      </Cartao>
    </div>
  ) : (
    <div id="proposta" className="mx-auto flex w-full max-w-3xl scroll-mt-4 flex-col gap-4 [&>*]:min-w-0">
      {pode(atual.papel, PROPOSTA_E_CONTRATO) && (
        <>
          {!emissoesAusente && regrasCondicoes && (
            <Cartao titulo="Proposta">
            <EmitirProposta
              negocioId={negocio.id}
              hoje={hojeEmSaoPaulo()}
              validadePadraoDias={validadePadraoDias}
              podeAjustarValidade={pode(atual.papel, VALIDADE_PROPOSTA)}
              conteudoModelo={conteudoModelo}
              preco={negocio.valor}
              regrasCondicoes={regrasCondicoes}
              geracaoConfirmada={geracaoConfirmada}
              bloqueio={arquivado ? "Negócio arquivado: não é possível emitir proposta." : bloqueioEmissao}
              avisoValor={
                condicaoRegistrada && negocio.valor !== condicaoRegistrada.precoProposta
                  ? `O valor do negócio (${formatarMoeda(negocio.valor)}) foi ajustado pela condição escolhida no contrato; a proposta v${condicaoRegistrada.versao} era de ${formatarMoeda(condicaoRegistrada.precoProposta)}. Confira o preço antes de emitir uma nova.`
                  : null
              }
              siteUrl={env.siteUrl}
              emissoes={emissoes.map((e) => ({ versao: e.versao, token: e.token, validadeAte: e.validade_ate, emitidaEm: e.emitida_em }))}
            />
            </Cartao>
          )}
          {/* Link pelo modelo (com economia): fica escondido enquanto a economia não for validada pela engenharia
              (hoje a geração é sempre bloqueada). Um link já gerado continua à vista para copiar. */}
          {proposta && (
          <Cartao titulo="Proposta por link (modelo completo)">
          <Proposta
            negocioId={negocio.id}
            precoDesatualizado={precoDesatualizado}
            bloqueio={bloqueioProposta}
            siteUrl={env.siteUrl}
            modelos={(modelosProposta ?? []).map((m) => ({ id: m.id, nome: m.nome, padrao: m.padrao }))}
            proposta={
              proposta
                ? {
                    token: proposta.token,
                    modoPreco: proposta.modo_preco as ModoPreco,
                    mostrarSistema: proposta.mostrar_sistema,
                    mostrarEconomia: proposta.mostrar_economia,
                    aberturas: aberturas?.length ?? 0,
                    ultimaAbertura: aberturas?.[0]?.aberta_em ?? null,
                  }
                : null
            }
          />
          </Cartao>
          )}
        </>
      )}
      {desconto && (
        <div id="desconto" className="scroll-mt-4">
          <Cartao titulo="Desconto à vista">
            <DescontoNegocio
              negocioId={negocio.id}
              limite={desconto.limite}
              souAdmin={souAdmin}
              possoDecidir={desconto.possoDecidir}
              podePedir={!arquivado}
              pedidos={desconto.pedidos.map((p) => ({
                id: p.id,
                percentual: Number(p.percentual),
                motivo: p.motivo,
                status: p.status as "pendente" | "aprovado" | "recusado" | "cancelado",
                solicitante: nomes.membro(p.solicitado_por),
                decisor: p.decidido_por ? nomes.membro(p.decidido_por) : null,
                decididoEm: p.decidido_em,
                motivoDecisao: p.motivo_decisao,
                criadoEm: p.created_at,
              }))}
            />
          </Cartao>
        </div>
      )}
      {pode(atual.papel, PROPOSTA_E_CONTRATO) && (
        <div id="contrato" className="flex scroll-mt-4 flex-col gap-4">
          {!arquivado && (!contrato || contrato.status === "rascunho") && (
            <Cartao titulo="Dados do cliente para o contrato">
              <DadosCliente negocioId={negocio.id} contato={contato} pendencias={pendenciasCliente} />
            </Cartao>
          )}
          <Cartao titulo="Contrato">
            <Contrato
              negocioId={negocio.id}
              siteUrl={env.siteUrl}
              precoDesatualizado={precoContratoDesatualizado}
              bloqueio={
                bloqueioContrato ?? (!precoContratoDesatualizado && pendenciasCliente.length ? mensagemPendenciasContrato(pendenciasCliente) : null)
              }
              contrato={contrato ? { token: contrato.token, status: contrato.status as StatusContrato } : null}
              escolha={
                escolhaCondicao
                  ? { versao: escolhaCondicao.emissao.versao, validadeAte: escolhaCondicao.emissao.validadeAte, opcoes: escolhaCondicao.opcoes }
                  : null
              }
              condicaoRegistrada={condicaoRegistrada}
              valorNegocio={negocio.valor}
              ganhoSemPermissao={negocio.status === "ganho" && !pode(atual.papel, CORRIGIR_VALOR_GANHO)}
            />
          </Cartao>
        </div>
      )}
      {(mostrarPagamentoSolo || mostrarPagamentoPro) && (
        <div id="pagamento" className="scroll-mt-4">
          <Cartao titulo="Pagamento">
            <div className="flex flex-col gap-4">
              {registroManualIndisponivel && (
                <p className="text-xs text-zinc-500" role="status">
                  Registro manual de pagamento temporariamente indisponível.
                </p>
              )}
              {mostrarPagamentoSolo && (
                <PagamentoSolo
                  negocioId={negocio.id}
                  hoje={hojeEmSaoPaulo()}
                  situacao={situacaoPagamentoSolo}
                  podeRetificar={pode(atual.papel, PAGAMENTO_SOLO)}
                  confirmacaoProAtiva={statusPagamento === "confirmado"}
                  registros={(registrosPagamento ?? []).map((r) => ({
                    id: r.id,
                    dataRecebimento: r.data_recebimento,
                    observacao: r.observacao,
                    autor: nomes.membro(r.registrado_por_membro_id),
                    registradoEm: r.registrado_em,
                    substituiId: r.substitui_id,
                    estornadoEm: r.estornado_em,
                    estornadoPor: r.estornado_por_membro_id ? nomes.membro(r.estornado_por_membro_id) : null,
                    motivoEstorno: r.motivo_estorno,
                  }))}
                />
              )}
              {mostrarPagamentoPro && contrato && (
                <PagamentoPro
                  atual={atual}
                  negocioId={negocio.id}
                  contratoId={contrato.id}
                  status={statusPagamento as StatusPagamentoContrato}
                  podeConfirmar={pode(atual.papel, CONFIRMAR_PAGAMENTO)}
                  podeInformar={!arquivado && pode(atual.papel, INFORMAR_PAGAMENTO)}
                  pastaComprovante={pastaComprovante(atual.empresaId, contrato.id)}
                  hoje={hojeEmSaoPaulo()}
                />
              )}
            </div>
          </Cartao>
        </div>
      )}
    </div>
  );
}

/** Cartão do Pro com o último aviso do vendedor ("o cliente pagou", com comprovante), lido só quando há contrato. */
async function PagamentoPro({
  atual,
  ...props
}: Omit<ComponentProps<typeof Pagamento>, "aviso"> & { atual: { empresaId: string; membroId: string } }) {
  const aviso = await carregarUltimoAviso(await criarClienteServidor(), atual, props.contratoId);
  return <Pagamento {...props} aviso={aviso} />;
}
