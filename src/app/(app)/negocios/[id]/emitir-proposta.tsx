"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { emitirPropostaSimples } from "@/lib/acoes/propostas-emissoes";
import { formatarDataHora, formatarDataIso } from "@/lib/formatacao";
import type { RegrasCondicoes } from "@/lib/condicoes-pagamento-proposta";
import { somarDias, type ConteudoDoModelo } from "@/lib/propostas/proposta-simples";
import { CondicoesPagamento } from "./condicoes-pagamento";

export type EmissaoListada = { versao: number; token: string; validadeAte: string; emitidaEm: string };

export function EmitirProposta({
  negocioId,
  hoje,
  validadePadraoDias,
  podeAjustarValidade = false,
  conteudoModelo,
  preco,
  regrasCondicoes,
  geracaoConfirmada,
  bloqueio,
  avisoValor = null,
  emissoes,
  siteUrl,
}: {
  negocioId: string;
  /** AAAA-MM-DD de hoje em São Paulo: a validade não pode ser anterior. */
  hoje: string;
  /** Dias de validade sugeridos (modelo padrão da empresa, ou 10): a data já vem preenchida. */
  validadePadraoDias: number;
  /** Admin e gestor: a dica leva à tela onde se muda a validade padrão. */
  podeAjustarValidade?: boolean;
  /** Conteúdo que a empresa escreveu no modelo padrão publicado (só leitura): observação sugerida das condições e blocos com conteúdo. */
  conteudoModelo: ConteudoDoModelo;
  /** Valor do negócio: base das contas das condições de pagamento. */
  preco: number | null;
  /** O que a empresa permite a quem emite nas condições de pagamento (o servidor confere de novo). */
  regrasCondicoes: RegrasCondicoes;
  /** O admin confirmou a produtividade atual da calculadora: só então a proposta mostra a geração estimada. */
  geracaoConfirmada: boolean;
  /** Motivo pelo qual não dá para emitir agora (o servidor confere de novo); nulo = liberada. */
  bloqueio: string | null;
  /** O valor do negócio já foi ajustado por uma condição escolhida no contrato: conferir o preço antes de emitir. */
  avisoValor?: string | null;
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
        <p className="text-sm text-zinc-600">
          Proposta simples: o sistema, a geração estimada, o preço e as condições. Não inclui economia nem prazo de retorno. Depois de
          emitida não muda: para corrigir, emita uma nova versão.
        </p>
        {bloqueio && (
          <p role="status" data-testid="emissao-bloqueada" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {bloqueio}
          </p>
        )}
        {avisoValor && (
          <p role="status" data-testid="aviso-valor-condicao" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {avisoValor}
          </p>
        )}
        <Campo
          rotulo="Válida até"
          type="date"
          name="validadeAte"
          required
          min={hoje}
          defaultValue={somarDias(hoje, validadePadraoDias)}
        />
        <p className="-mt-2 text-xs text-zinc-500">
          Padrão de {validadePadraoDias} dias a partir de hoje.{" "}
          {podeAjustarValidade && (
            <Link href="/configuracoes/validade-proposta" className="font-medium text-dourado-texto underline-offset-2 hover:underline">
              Mudar o padrão
            </Link>
          )}
        </p>
        <CondicoesPagamento negocioId={negocioId} preco={preco} regras={regrasCondicoes} observacaoSugerida={conteudoModelo.condicoes} hoje={hoje} />
        <ul className="flex flex-col gap-1 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600" data-testid="conteudo-confirmado">
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
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
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
              <li key={e.token} className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-sm">
                <span className="font-medium text-zinc-800">
                  Versão {e.versao} · emitida em {formatarDataHora(e.emitidaEm)} · válida até {formatarDataIso(e.validadeAte)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <input
                    readOnly
                    value={link}
                    onFocus={(ev) => ev.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 outline-none"
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
