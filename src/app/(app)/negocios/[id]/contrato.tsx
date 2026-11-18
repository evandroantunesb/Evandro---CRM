"use client";

import { useActionState, useState } from "react";
import { DocumentoFormatado } from "@/components/documento-formatado";
import { EnvioContrato, type ClienteContrato } from "./envio-contrato";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { atualizarStatusContrato, editarTextoContrato, gerarContrato } from "@/lib/acoes/contratos";
import { MENSAGEM_PRECO_DESATUALIZADO } from "@/lib/calculo-preco";
import type { CondicaoRegistrada, OpcaoEscolha } from "@/lib/condicao-escolhida";
import { formatarDataIso, formatarMoeda } from "@/lib/formatacao";
import { ROTULO_STATUS_CONTRATO, STATUS_CONTRATO, type ResultadoAcao, type StatusContrato } from "@/lib/tipos";

export type ContratoSalvo = {
  token: string;
  status: StatusContrato;
  /** Texto atual do contrato (o que o link, o PDF e o WhatsApp mostram). */
  conteudo: string;
  /** Marca "texto editado à mão" (o banco a mantém; some ao gerar de novo). */
  editadoEm: string | null;
  editadoPorNome: string | null;
};

const AVISO_PERDER_EDICOES = "O texto volta ao modelo e você perde as edições feitas à mão. Gerar de novo?";

export function Contrato({
  negocioId,
  contrato,
  siteUrl,
  cliente,
  podeEditar = false,
  precoDesatualizado = false,
  bloqueio = null,
  escolha = null,
  condicaoRegistrada = null,
  valorNegocio = null,
  ganhoSemPermissao = false,
}: {
  negocioId: string;
  contrato: ContratoSalvo | null;
  siteUrl: string;
  /** Contato do negócio: o WhatsApp abre a conversa dele. */
  cliente: ClienteContrato;
  /** Admin, gestor ou o vendedor responsável (a barreira real é `editar_texto_contrato`). */
  podeEditar?: boolean;
  /** Valor do negócio diferente do preço do cálculo: o servidor não gera o contrato nesse estado. */
  precoDesatualizado?: boolean;
  /** Mensagem do servidor quando o cálculo salvo impede o contrato (nunca por `legado`); nulo = liberado. */
  bloqueio?: string | null;
  /** Opções da última proposta por modalidade (dentro da validade); nulo = contrato sem escolha, como antes. */
  escolha?: { versao: number; validadeAte: string; opcoes: OpcaoEscolha[] } | null;
  condicaoRegistrada?: CondicaoRegistrada | null;
  valorNegocio?: number | null;
  /** Negócio ganho e quem vê não é admin nem gestor: só eles registram a condição (correção de valor). */
  ganhoSemPermissao?: boolean;
}) {
  const [resultadoGerar, acaoGerar, gerando] = useActionState(gerarContrato, null);
  const [resultadoStatus, acaoStatus] = useActionState(atualizarStatusContrato, null);
  const [editando, setEditando] = useState(false);
  // Campo controlado: o React limpa o formulário depois da ação, e um texto recusado pelo banco não pode se perder.
  const [textoEmEdicao, setTextoEmEdicao] = useState("");
  const [confirmarGerar, setConfirmarGerar] = useState(false);
  const [resultadoTexto, acaoTexto, salvandoTexto] = useActionState(async (anterior: ResultadoAcao, dados: FormData) => {
    const r = await editarTextoContrato(anterior, dados);
    if (r?.ok) setEditando(false);
    return r;
  }, null);

  if (!contrato || contrato.status === "rascunho") {
    const editado = !!contrato?.editadoEm;
    const gerarDesabilitado = gerando || precoDesatualizado || !!bloqueio || (!!escolha && ganhoSemPermissao);
    const rotuloGerar = gerando ? "Gerando..." : escolha ? "Registrar e gerar contrato" : contrato ? "Gerar novamente" : "Gerar contrato";
    return (
      <div className="flex flex-col gap-3">
        {contrato?.editadoEm && <MarcaEditado editadoEm={contrato.editadoEm} nome={contrato.editadoPorNome} />}
        {contrato && !editando && (
          <div
            tabIndex={0}
            aria-label="Texto do contrato"
            data-testid="texto-contrato"
            className="max-h-80 overflow-y-auto rounded-lg border border-linha bg-superficie px-4 py-3 text-sm text-texto"
          >
            <DocumentoFormatado texto={contrato.conteudo} />
          </div>
        )}
        {contrato && editando && (
          <form action={acaoTexto} className="flex flex-col gap-2">
            <input type="hidden" name="negocioId" value={negocioId} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Texto do contrato</span>
              <textarea
                name="conteudo"
                value={textoEmEdicao}
                onChange={(e) => setTextoEmEdicao(e.target.value)}
                rows={16}
                maxLength={60000}
                className="rounded-md border border-dourado bg-superficie px-3 py-2 font-mono text-xs leading-relaxed text-texto"
              />
            </label>
            <p className="text-xs text-texto-2">
              Use <b>## </b> para título, <b>**negrito**</b> e <b>- </b> para lista. Não deixe chaves <b>{"{{ }}"}</b> no texto. O
              link, o PDF e o WhatsApp passam a usar este texto.
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Valor, pontos e comissão continuam vindo do negócio, não do texto. A edição fica no histórico com seu nome.
            </p>
            <Mensagem resultado={resultadoTexto} />
            <div className="flex flex-wrap gap-2">
              <Botao type="submit" disabled={salvandoTexto}>
                {salvandoTexto ? "Salvando..." : "Salvar texto"}
              </Botao>
              <Botao type="button" variante="secundario" onClick={() => setEditando(false)}>
                Cancelar
              </Botao>
            </div>
          </form>
        )}
        {contrato && !editando && (
          <>
            <Mensagem resultado={resultadoTexto} />
            <p className="text-xs text-texto-2">Algo errado nos dados? Corrija no negócio e gere de novo. Para ajustar o texto, use “Editar texto”.</p>
          </>
        )}
        {!editando && (
          <form action={acaoGerar} className="flex flex-col gap-2">
            <input type="hidden" name="negocioId" value={negocioId} />
            {escolha && (
              <EscolhaCondicao escolha={escolha} registrada={condicaoRegistrada} valorNegocio={valorNegocio} ganhoSemPermissao={ganhoSemPermissao} />
            )}
            {bloqueio ? (
              <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {bloqueio}
              </p>
            ) : (
              precoDesatualizado && (
                <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {MENSAGEM_PRECO_DESATUALIZADO}
                </p>
              )
            )}
            <Mensagem resultado={resultadoGerar} />
            {editado && confirmarGerar ? (
              <div role="alert" className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">{AVISO_PERDER_EDICOES}</p>
                <div className="flex flex-wrap gap-2">
                  <Botao type="submit" disabled={gerarDesabilitado}>
                    Gerar e perder edições
                  </Botao>
                  <Botao type="button" variante="secundario" onClick={() => setConfirmarGerar(false)}>
                    Manter
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {contrato && podeEditar && (
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => {
                      setTextoEmEdicao(contrato.conteudo);
                      setEditando(true);
                    }}
                  >
                    Editar texto
                  </Botao>
                )}
                {editado ? (
                  <Botao type="button" variante="secundario" disabled={gerarDesabilitado} onClick={() => setConfirmarGerar(true)}>
                    {rotuloGerar}
                  </Botao>
                ) : (
                  <Botao type="submit" variante={contrato ? "secundario" : "primario"} disabled={gerarDesabilitado}>
                    {rotuloGerar}
                  </Botao>
                )}
              </div>
            )}
          </form>
        )}
        {contrato && (
          <>
            <hr className="border-linha" />
            <EnvioContrato token={contrato.token} siteUrl={siteUrl} cliente={cliente} />
            <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {condicaoRegistrada && <CondicaoDoContrato condicao={condicaoRegistrada} />}
      <EnvioContrato token={contrato.token} siteUrl={siteUrl} cliente={cliente} />
      <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />
    </div>
  );
}

function MarcaEditado({ editadoEm, nome }: { editadoEm: string; nome: string | null }) {
  const quando = new Date(editadoEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p className="self-start rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-700" data-testid="contrato-editado">
      Texto editado à mão{nome ? ` · ${nome}` : ""}, {quando}
    </p>
  );
}

function FormularioStatus({
  negocioId,
  status,
  acao,
  resultado,
}: {
  negocioId: string;
  status: StatusContrato;
  acao: (payload: FormData) => void;
  resultado: { ok: boolean; mensagem: string } | null;
}) {
  return (
    <form action={acao} className="flex items-end gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <Selecao rotulo="Status do contrato" name="status" defaultValue={status}>
        {STATUS_CONTRATO.map((s) => (
          <option key={s} value={s}>
            {ROTULO_STATUS_CONTRATO[s]}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" variante="secundario">
        Salvar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function CondicaoDoContrato({ condicao }: { condicao: CondicaoRegistrada }) {
  return (
    <p className="text-sm text-texto-2" data-testid="condicao-registrada">
      Condição escolhida pelo cliente (proposta v{condicao.versao}): <span className="text-texto">{condicao.descricao}</span>
    </p>
  );
}

/**
 * A condição que o cliente escolheu, entre as da última proposta: cada opção mostra como fica o valor do negócio. O
 * servidor confere a opção e grava contrato, condição e valor juntos.
 */
function EscolhaCondicao({
  escolha,
  registrada,
  valorNegocio,
  ganhoSemPermissao,
}: {
  escolha: { versao: number; validadeAte: string; opcoes: OpcaoEscolha[] };
  registrada: CondicaoRegistrada | null;
  valorNegocio: number | null;
  ganhoSemPermissao: boolean;
}) {
  const inicial = registrada && escolha.opcoes.some((o) => o.id === registrada.opcao) ? registrada.opcao : null;
  const [marcada, setMarcada] = useState<string | null>(inicial);
  const escolhida = escolha.opcoes.find((o) => o.id === marcada) ?? null;
  const grupos = [...new Set(escolha.opcoes.map((o) => o.grupo))];

  return (
    <fieldset className="flex flex-col gap-2" data-testid="escolha-condicao">
      <legend className="mb-1 text-sm font-medium text-texto">
        Condição que o cliente escolheu (proposta v{escolha.versao}, válida até {formatarDataIso(escolha.validadeAte)})
      </legend>
      {grupos.map((grupo) => (
        <div key={grupo} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-dourado-texto uppercase">{grupo}</span>
          {escolha.opcoes
            .filter((o) => o.grupo === grupo)
            .map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-linha px-3 py-2 text-sm has-[:checked]:border-dourado has-[:checked]:bg-dourado/10"
              >
                <input type="radio" name="condicao" value={o.id} checked={marcada === o.id} onChange={() => setMarcada(o.id)} className="mt-1" />
                <span className="min-w-0">
                  <span className="font-medium text-texto tabular-nums">{o.titulo}</span>
                  <span className="block text-xs text-texto-2 tabular-nums">
                    {[o.detalhe, `valor do negócio: ${formatarMoeda(o.valorNegocio)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            ))}
        </div>
      ))}
      {escolhida && valorNegocio != null && escolhida.valorNegocio !== valorNegocio && (
        <p className="text-sm text-texto-2 tabular-nums">
          Valor do negócio hoje: <strong className="text-texto">{formatarMoeda(valorNegocio)}</strong> → passa a{" "}
          <strong className="text-texto">{formatarMoeda(escolhida.valorNegocio)}</strong>
        </p>
      )}
      {ganhoSemPermissao && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Negócio já ganho: só gestor ou admin registra a condição (a mudança de valor fica registrada como correção, com o motivo).
        </p>
      )}
    </fieldset>
  );
}
