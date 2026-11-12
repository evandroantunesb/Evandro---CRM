"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Botao, CLASSE_ENTRADA, FOCO } from "@/components/ui";
import { anotarEtapa, etapaNaoSeAplica, marcarEtapa, preverEtapa } from "@/lib/acoes/obra-solo";
import { ETAPAS_FIXAS, ETAPAS_NAO_SE_APLICA, ROTULO_ETAPA, linkWhatsApp, mensagemWhatsApp, type EtapaChecklist } from "@/lib/obras/checklist";
import type { EtapaSoloVM } from "@/lib/obras/solo-dados";
import type { ResultadoAcao } from "@/lib/tipos";
import { FotosEtapa } from "./fotos";

const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Contexto = { obraId: string; empresaId: string; clienteNome: string; link: string | null; telefone: string | null };

/**
 * Checklist da obra do Solo (quadro aprovado "SoloChecklist"): as 10 etapas em linha do tempo; a etapa atual abre com
 * as ações. Marcação em qualquer ordem; desmarcar pede confirmação; "Não se aplica" pede o motivo. A página do cliente
 * atualiza na hora; o aviso é pelo botão do WhatsApp.
 */
export function ChecklistSolo({ etapas, atual, contexto }: { etapas: EtapaSoloVM[]; atual: EtapaChecklist | null; contexto: Contexto }) {
  const [aberta, setAberta] = useState<EtapaChecklist | null>(atual);
  const [recemFeita, setRecemFeita] = useState<EtapaChecklist | null>(null);

  return (
    <section className="painel p-5 md:p-6">
      <p className="text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">Checklist</p>
      <h2 className="mb-4 font-titulo text-[17px] font-semibold text-texto">Do contrato à entrega</h2>
      <ol className="flex flex-col">
        {etapas.map((e, i) => {
          const feita = e.feitaEm != null;
          const resolvida = feita || e.naoSeAplica;
          const ehAtual = e.etapa === atual;
          return (
            <li key={e.etapa} className="relative flex gap-3.5 pb-4 last:pb-0">
              {i < etapas.length - 1 && (
                <span aria-hidden className={`absolute top-8 bottom-0 left-[15px] w-0.5 ${resolvida ? "bg-dourado" : "bg-linha"}`} />
              )}
              <span
                aria-hidden
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                  resolvida ? "bg-dourado text-carvao" : ehAtual ? "bg-carvao text-offwhite ring-[5px] ring-dourado/30" : "bg-superficie text-texto-2 ring-2 ring-linha ring-inset"
                }`}
              >
                {resolvida ? <Check size={15} strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <button
                  type="button"
                  aria-expanded={aberta === e.etapa}
                  onClick={() => setAberta(aberta === e.etapa ? null : e.etapa)}
                  className={`text-left font-semibold ${resolvida || ehAtual ? "text-texto" : "text-texto-2"} rounded ${FOCO}`}
                >
                  {ROTULO_ETAPA[e.etapa]}
                </button>
                <p className="text-xs text-texto-2">
                  {feita
                    ? [dataCurta(e.feitaEm!), e.fotos.length ? `${e.fotos.length} ${e.fotos.length === 1 ? "foto" : "fotos"}` : null].filter(Boolean).join(" · ")
                    : e.naoSeAplica
                      ? `Não se aplica · ${e.motivo}`
                      : e.previstaPara
                        ? `prevista para ${dataCurta(e.previstaPara)}`
                        : "sem data prevista"}
                </p>
                {e.anotacao && aberta !== e.etapa && <p className="mt-1 text-xs text-texto-2 italic">Só você vê: {e.anotacao}</p>}
                {recemFeita === e.etapa && <AvisoWhatsApp etapa={e.etapa} contexto={contexto} fechar={() => setRecemFeita(null)} />}
                {aberta === e.etapa && <AcoesEtapa etapa={e} contexto={contexto} aoMarcar={() => setRecemFeita(e.etapa)} />}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Botão verde do WhatsApp com a mensagem da etapa; sem telefone do cliente, desligado com a explicação. */
export function BotaoWhatsApp({ etapa, contexto, className = "" }: { etapa: EtapaChecklist; contexto: Contexto; className?: string }) {
  const href = contexto.link ? linkWhatsApp(contexto.telefone, mensagemWhatsApp({ clienteNome: contexto.clienteNome, etapa, link: contexto.link })) : null;
  if (!href) {
    return (
      <span className={`inline-flex flex-col gap-0.5 ${className}`}>
        <span aria-disabled className="inline-flex min-h-9 cursor-not-allowed items-center rounded-full border border-current px-4 text-sm font-medium opacity-50">
          Avisar no WhatsApp
        </span>
        <span className="text-xs opacity-75">{contexto.link ? "O cliente não tem telefone no cadastro." : "A obra ainda não tem link do cliente."}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-9 items-center rounded-full bg-energia px-4 text-sm font-medium text-white hover:opacity-90 ${FOCO} ${className}`}
    >
      Avisar no WhatsApp
    </a>
  );
}

function AvisoWhatsApp({ etapa, contexto, fechar }: { etapa: EtapaChecklist; contexto: Contexto; fechar: () => void }) {
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-superficie-2 p-3 text-sm">
      <span className="text-texto">Etapa marcada. Quer avisar o cliente?</span>
      <BotaoWhatsApp etapa={etapa} contexto={contexto} />
      <button type="button" onClick={fechar} className={`rounded text-xs text-texto-2 hover:text-texto ${FOCO}`}>
        Agora não
      </button>
    </div>
  );
}

function AcoesEtapa({ etapa: e, contexto, aoMarcar }: { etapa: EtapaSoloVM; contexto: Contexto; aoMarcar: () => void }) {
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciar] = useTransition();
  const [dataFeita, setDataFeita] = useState(hojeIso());
  const [prevista, setPrevista] = useState(e.previstaPara ?? "");
  const [anotacao, setAnotacao] = useState(e.anotacao ?? "");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const feita = e.feitaEm != null;
  const executar = (acao: () => Promise<ResultadoAcao>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      setResultado(r);
      if (r?.ok) depois?.();
    });

  return (
    <div className="mt-2.5 flex flex-col gap-3 rounded-2xl bg-superficie-2 p-3">
      {e.naoSeAplica ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-texto">Não se aplica · {e.motivo}</span>
          <Botao type="button" variante="secundario" disabled={pendente} onClick={() => executar(() => etapaNaoSeAplica(contexto.obraId, e.etapa, null))}>
            Desfazer
          </Botao>
        </div>
      ) : feita ? (
        !ETAPAS_FIXAS.includes(e.etapa) && (
          <div>
            <Botao
              type="button"
              variante="secundario"
              disabled={pendente}
              onClick={() => {
                if (confirm(`Desmarcar "${ROTULO_ETAPA[e.etapa]}"? O cliente deixa de ver esta etapa como feita.`)) {
                  executar(() => marcarEtapa(contexto.obraId, e.etapa, false, null));
                }
              }}
            >
              Desmarcar
            </Botao>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Feita em
              <input type="date" value={dataFeita} max={hojeIso()} onChange={(ev) => setDataFeita(ev.target.value)} className={`${CLASSE_ENTRADA} text-sm`} />
            </label>
            <Botao type="button" disabled={pendente} onClick={() => executar(() => marcarEtapa(contexto.obraId, e.etapa, true, dataFeita || null), aoMarcar)}>
              ✓ Marcar como feita
            </Botao>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Data prevista
              <input type="date" value={prevista} onChange={(ev) => setPrevista(ev.target.value)} className={`${CLASSE_ENTRADA} text-sm`} />
            </label>
            <Botao type="button" variante="secundario" disabled={pendente} onClick={() => executar(() => preverEtapa(contexto.obraId, e.etapa, prevista || null))}>
              {prevista ? "Salvar data" : "Tirar data"}
            </Botao>
          </div>
          {ETAPAS_NAO_SE_APLICA.includes(e.etapa) &&
            (pedindoMotivo ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-texto-2">
                  Por que não se aplica?
                  <input value={motivo} maxLength={500} onChange={(ev) => setMotivo(ev.target.value)} className={`${CLASSE_ENTRADA} text-sm`} />
                </label>
                <Botao type="button" variante="secundario" disabled={pendente} onClick={() => executar(() => etapaNaoSeAplica(contexto.obraId, e.etapa, motivo), () => setPedindoMotivo(false))}>
                  Confirmar
                </Botao>
                <button type="button" onClick={() => setPedindoMotivo(false)} className={`rounded text-xs text-texto-2 ${FOCO}`}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div>
                <Botao type="button" variante="secundario" onClick={() => setPedindoMotivo(true)}>
                  Não se aplica
                </Botao>
              </div>
            ))}
        </>
      )}

      {!e.naoSeAplica && <FotosEtapa empresaId={contexto.empresaId} obraId={contexto.obraId} etapa={e.etapa} fotos={e.fotos} />}

      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Anotação · Só você vê
          <textarea value={anotacao} maxLength={1000} rows={2} onChange={(ev) => setAnotacao(ev.target.value)} className={`${CLASSE_ENTRADA} text-sm`} />
        </label>
        <div>
          <Botao type="button" variante="secundario" disabled={pendente || anotacao === (e.anotacao ?? "")} onClick={() => executar(() => anotarEtapa(contexto.obraId, e.etapa, anotacao))}>
            Salvar anotação
          </Botao>
        </div>
      </div>

      <p className="text-xs text-texto-2">A página do cliente atualiza na hora. Para avisar, use “Avisar no WhatsApp”.</p>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-xs text-erro">
          {resultado.mensagem}
        </p>
      )}
    </div>
  );
}
