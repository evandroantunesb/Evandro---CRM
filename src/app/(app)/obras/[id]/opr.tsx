"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { abrirEscalonamentoObra, fecharEscalonamentoObra, pedirJustificativaAtraso, responderJustificativaAtraso } from "@/lib/acoes/obras-opr";
import { formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import { ROTULO_ETAPA, type EtapaObra } from "@/lib/obras/cronograma";
import type { AtrasoEtapaVM } from "@/lib/obras/justificativas";

/**
 * Ficha da obra, OPR: atrasos de etapa com a justificativa (pedir, cobrar e responder) e os escalonamentos (abrir e
 * fechar). Quem pode o quê o servidor decide; aqui só aparecem os controles liberados.
 */

const CAMPO =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20";

const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AtrasosObra({ obraId, atrasos, podePedir }: { obraId: string; atrasos: AtrasoEtapaVM[]; podePedir: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-100">
      {atrasos.map((a) => (
        <li key={a.etapa} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <p className="text-sm">
            <span className="font-medium text-texto">{ROTULO_ETAPA[a.etapa]}</span>
            <span className={`ml-2 text-xs font-semibold ${a.atraso > 5 ? "text-erro" : "text-atencao-texto"}`}>+{dias(a.atraso)}</span>
          </p>
          <Justificativa obraId={obraId} atraso={a} podePedir={podePedir} />
        </li>
      ))}
    </ul>
  );
}

function Justificativa({ obraId, atraso: { etapa, justificativa: j }, podePedir }: { obraId: string; atraso: AtrasoEtapaVM; podePedir: boolean }) {
  if (j?.respondidoEm) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="break-words text-texto">{j.texto}</p>
        <p className="text-xs text-texto-2">
          {j.respondidoPor} · respondeu em {formatarDataHora(j.respondidoEm)}
        </p>
        {podePedir && <Pedir obraId={obraId} etapa={etapa} rotulo="Pedir nova justificativa" />}
      </div>
    );
  }
  if (j) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-texto-2">
          <span className="font-semibold text-atencao-texto">Justificativa pendente</span> · pedida a {j.pedidoA} em {formatarDataHora(j.pedidoEm)} · prazo para
          responder: {dataBr(j.prazo)}
        </p>
        {j.podeResponder && <Responder obraId={obraId} justificativaId={j.id} />}
        {podePedir && <Pedir obraId={obraId} etapa={etapa} rotulo="Cobrar justificativa" cobrar />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-texto-2">Sem justificativa.</p>
      {podePedir && <Pedir obraId={obraId} etapa={etapa} rotulo="Pedir justificativa" />}
    </div>
  );
}

function Pedir({ obraId, etapa, rotulo, cobrar = false }: { obraId: string; etapa: EtapaObra; rotulo: string; cobrar?: boolean }) {
  const [resultado, acao, pendente] = useActionState(pedirJustificativaAtraso, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="etapa" value={etapa} />
      {cobrar && <input type="hidden" name="cobrar" value="1" />}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Enviando..." : rotulo}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function Responder({ obraId, justificativaId }: { obraId: string; justificativaId: string }) {
  const [resultado, acao, pendente] = useActionState(responderJustificativaAtraso, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="justificativaId" value={justificativaId} />
      <textarea name="texto" required minLength={3} maxLength={500} rows={2} aria-label="Justificativa do atraso" placeholder="O que causou o atraso?" className={CAMPO} />
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Enviando..." : "Responder"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export type EscalonamentoVM = {
  id: string;
  titulo: string;
  valor: number | null;
  abertoPor: string;
  abertoEm: string;
  resolucao: string | null;
  fechadoPor: string | null;
  fechadoEm: string | null;
};

export function EscalonamentosObra({ obraId, itens, podeEscalonar }: { obraId: string; itens: EscalonamentoVM[]; podeEscalonar: boolean }) {
  const abertos = itens.filter((e) => !e.fechadoEm);
  const fechados = itens.filter((e) => e.fechadoEm);
  return (
    <div className="flex flex-col gap-4">
      {abertos.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum escalonamento aberto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100">
          {abertos.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 py-2.5 first:pt-0">
              <div className="text-sm">
                <p className="font-medium break-words text-texto">{e.titulo}</p>
                <p className="text-xs text-texto-2">
                  Aberto por {e.abertoPor} em {formatarDataHora(e.abertoEm)}
                  {e.valor != null && ` · ${formatarMoeda(e.valor)} fora do programado`}
                </p>
              </div>
              {podeEscalonar && <Fechar obraId={obraId} escalonamentoId={e.id} />}
            </li>
          ))}
        </ul>
      )}

      {podeEscalonar && <Abrir obraId={obraId} />}

      {fechados.length > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-xs text-zinc-600 underline select-none hover:text-zinc-900">Fechados ({fechados.length})</summary>
          <ul className="mt-2 flex flex-col divide-y divide-zinc-100">
            {fechados.map((e) => (
              <li key={e.id} className="py-2">
                <p className="font-medium break-words text-texto">{e.titulo}</p>
                <p className="break-words text-texto-2">{e.resolucao}</p>
                <p className="text-xs text-texto-2">
                  Fechado por {e.fechadoPor} em {formatarDataHora(e.fechadoEm!)}
                  {e.valor != null && ` · ${formatarMoeda(e.valor)} fora do programado`}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Abrir({ obraId }: { obraId: string }) {
  const [resultado, acao, pendente] = useActionState(abrirEscalonamentoObra, null);
  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50/60 text-sm">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-zinc-800 select-none group-open:border-b group-open:border-zinc-200">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> Abrir escalonamento
      </summary>
      <form action={acao} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <input type="hidden" name="obraId" value={obraId} />
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          O que precisa de decisão
          <input name="titulo" required minLength={3} maxLength={200} placeholder="Ex.: aprovar custo extra do reforço de estrutura" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Fora do programado (R$)
          <input name="valor" inputMode="decimal" placeholder="Opcional" className={CAMPO} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Botao type="submit" disabled={pendente}>
            {pendente ? "Abrindo..." : "Abrir escalonamento"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </details>
  );
}

function Fechar({ obraId, escalonamentoId }: { obraId: string; escalonamentoId: string }) {
  const [resultado, acao, pendente] = useActionState(fecharEscalonamentoObra, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <details className="group">
      <summary className="w-fit cursor-pointer list-none text-xs text-zinc-600 underline select-none hover:text-zinc-900">Fechar com a decisão</summary>
      <form onSubmit={enviar} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="obraId" value={obraId} />
        <input type="hidden" name="escalonamentoId" value={escalonamentoId} />
        <input name="resolucao" required minLength={3} maxLength={500} aria-label="Decisão tomada" placeholder="Decisão tomada" className={`${CAMPO} sm:flex-1`} />
        <Botao type="submit" variante="secundario" disabled={pendente}>
          {pendente ? "Fechando..." : "Fechar"}
        </Botao>
      </form>
      <Mensagem resultado={resultado} />
    </details>
  );
}
