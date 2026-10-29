"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { emitirPropostaSimples } from "@/lib/acoes/propostas-emissoes";
import { formatarDataHora, formatarDataIso } from "@/lib/formatacao";
import { LIMITES_SIMPLES, type ConteudoDoModelo } from "@/lib/propostas/proposta-simples";

export type EmissaoListada = { versao: number; token: string; validadeAte: string; emitidaEm: string };

export function EmitirProposta({
  negocioId,
  hoje,
  conteudoModelo,
  geracaoConfirmada,
  bloqueio,
  emissoes,
  siteUrl,
}: {
  negocioId: string;
  /** AAAA-MM-DD de hoje em São Paulo: a validade não pode ser anterior. */
  hoje: string;
  /** Conteúdo que a empresa escreveu no modelo padrão publicado (só leitura): sugestão de condições e blocos com conteúdo. */
  conteudoModelo: ConteudoDoModelo;
  /** O admin confirmou a produtividade atual da calculadora: só então a proposta mostra a geração estimada. */
  geracaoConfirmada: boolean;
  /** Motivo pelo qual não dá para emitir agora (o servidor confere de novo); nulo = liberada. */
  bloqueio: string | null;
  emissoes: EmissaoListada[];
  siteUrl: string;
}) {
  const [resultado, acao, emitindo] = useActionState(emitirPropostaSimples, null);
  const [copiado, setCopiado] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="negocioId" value={negocioId} />
        <input type="hidden" name="geracaoEsperada" value={geracaoConfirmada ? "sim" : "nao"} />
        <p className="text-sm text-texto-2">
          Proposta simples: o sistema, a geração estimada, o preço e as condições. Não inclui economia nem prazo de retorno. Depois de
          emitida não muda: para corrigir, emita uma nova versão.
        </p>
        {bloqueio && (
          <p role="status" data-testid="emissao-bloqueada" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {bloqueio}
          </p>
        )}
        <Campo rotulo="Válida até" type="date" name="validadeAte" required min={hoje} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Condições de pagamento</span>
          <textarea
            name="condicoesPagamento"
            defaultValue={conteudoModelo.condicoes}
            rows={3}
            required
            maxLength={LIMITES_SIMPLES.condicoes}
            className="rounded-lg border border-linha bg-superficie px-3 py-2 text-texto outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
          />
          <span className="text-xs text-texto-2">
            Uma opção por linha: cada linha vira um item da lista na proposta. Sugerido pelo modelo da empresa; o que estiver aqui na emissão fica congelado
            na versão enviada. Obrigatório: a proposta só é emitida com as condições de pagamento confirmadas.
          </span>
        </label>
        <ul className="flex flex-col gap-1 rounded-md bg-superficie-2 px-3 py-2 text-xs text-texto-2" data-testid="conteudo-confirmado">
          <li data-testid="geracao-status">
            Geração estimada:{" "}
            {geracaoConfirmada
              ? "entra na proposta (produtividade confirmada pelo admin)"
              : "fora da proposta: o admin precisa confirmar a produtividade em Configurações > Kits e calculadora"}
          </li>
          {(
            [
              ["Incluso", conteudoModelo.incluso?.length],
              ["Não incluso", conteudoModelo.exclusos?.length],
              ["Garantias", conteudoModelo.garantias?.length],
              ["Etapas", conteudoModelo.etapas?.length],
            ] as const
          ).map(([nome, n]) => (
            <li key={nome}>
              {nome}: {n ? `${n} item(ns) do modelo da empresa` : "fora da proposta (o modelo não tem conteúdo confirmado)"}
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-superficie-2 px-3 py-2 text-xs text-texto-2">
          Detalhe interno (não aparece para o cliente): GD II e Fio B de 60% em 2026 ficam fora da proposta até o enquadramento do negócio e
          os dados serem validados.
        </p>
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={emitindo || !!bloqueio} className="self-start">
          {emitindo ? "Emitindo..." : emissoes.length > 0 ? "Emitir nova versão" : "Emitir proposta"}
        </Botao>
      </form>

      {emissoes.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="lista-emissoes">
          {emissoes.map((e) => {
            const link = `${siteUrl}/proposta/${e.token}`;
            return (
              <li key={e.token} className="flex flex-col gap-1 rounded-lg border border-linha p-3 text-sm">
                <span className="font-medium text-texto">
                  Versão {e.versao} · emitida em {formatarDataHora(e.emitidaEm)} · válida até {formatarDataIso(e.validadeAte)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <input
                    readOnly
                    value={link}
                    onFocus={(ev) => ev.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto-2 outline-none"
                  />
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => {
                      navigator.clipboard.writeText(link);
                      setCopiado(e.versao);
                      setTimeout(() => setCopiado(null), 2000);
                    }}
                  >
                    {copiado === e.versao ? "Copiado!" : "Copiar"}
                  </Botao>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Segue a proposta: ${link}`)}`} target="_blank" rel="noopener noreferrer">
                    <Botao type="button">Enviar no WhatsApp</Botao>
                  </a>
                  <a href={`/proposta/${e.token}/pdf`} target="_blank" rel="noopener noreferrer">
                    <Botao type="button" variante="secundario">
                      Baixar PDF
                    </Botao>
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
