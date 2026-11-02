"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { atualizarStatusContrato, gerarContrato } from "@/lib/acoes/contratos";
import { MENSAGEM_PRECO_DESATUALIZADO } from "@/lib/calculo-preco";
import type { CondicaoRegistrada, OpcaoEscolha } from "@/lib/condicao-escolhida";
import { formatarDataIso, formatarMoeda } from "@/lib/formatacao";
import { ROTULO_STATUS_CONTRATO, STATUS_CONTRATO, type StatusContrato } from "@/lib/tipos";

export type ContratoSalvo = {
  token: string;
  status: StatusContrato;
};

export function Contrato({
  negocioId,
  contrato,
  siteUrl,
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
  const [copiado, setCopiado] = useState(false);

  if (!contrato || contrato.status === "rascunho") {
    return (
      <div className="flex flex-col gap-3">
        {contrato && (
          <p className="text-sm text-zinc-600">
            Contrato gerado como rascunho. Gerar de novo substitui o texto pelo modelo atual.
          </p>
        )}
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
          <Botao type="submit" disabled={gerando || precoDesatualizado || !!bloqueio || (!!escolha && ganhoSemPermissao)} className="self-start">
            {gerando ? "Gerando..." : escolha ? "Registrar e gerar contrato" : contrato ? "Gerar novamente" : "Gerar contrato"}
          </Botao>
        </form>
        {contrato && <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />}
        {contrato && <LinkContrato token={contrato.token} siteUrl={siteUrl} copiado={copiado} setCopiado={setCopiado} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {condicaoRegistrada && <CondicaoDoContrato condicao={condicaoRegistrada} />}
      <LinkContrato token={contrato.token} siteUrl={siteUrl} copiado={copiado} setCopiado={setCopiado} />
      <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />
    </div>
  );
}

function LinkContrato({
  token,
  siteUrl,
  copiado,
  setCopiado,
}: {
  token: string;
  siteUrl: string;
  copiado: boolean;
  setCopiado: (v: boolean) => void;
}) {
  const link = `${siteUrl}/contrato/${token}`;
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(`Segue o contrato: ${link}`)}`;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-700">Link do contrato</span>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <Botao
          type="button"
          variante="secundario"
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? "Copiado!" : "Copiar"}
        </Botao>
        <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
          <Botao type="button">Enviar no WhatsApp</Botao>
        </a>
        <a href={`/contrato/${token}/pdf`} target="_blank" rel="noopener noreferrer">
          <Botao type="button" variante="secundario">
            Baixar PDF
          </Botao>
        </a>
      </div>
    </div>
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
