"use client";

import { useEffect, useRef, useState } from "react";
import { Botao, Cartao, Mensagem } from "@/components/ui";
import { descartarFotoEntrada, enviarFotoEntrada, escolherFotoEntrada, type FotoEscolhida } from "@/lib/imagem-entrada-navegador";
import { TIPOS_IMAGEM_ACEITOS } from "@/lib/imagem-upload";
import { DICA_IMAGEM_ENTRADA, IMAGEM_PADRAO_ENTRADA } from "@/lib/tela-entrada";
import type { ResultadoAcao } from "@/lib/tipos";
import { salvarFaixa } from "./actions";

/**
 * "Faixa do topo" do quadro aprovado "Onboarding PRO · passo 3": a foto atrás do título de cada tela, a mesma da tela
 * de entrada (padrão) ou uma própria. Sem foto nenhuma, fica a paisagem do Raion. Usado em Configurações › Tela de
 * entrada e no assistente.
 */
export function CartaoFaixa({
  empresaId,
  usaEntrada: usaEntradaInicial,
  imagemEntrada,
  imagemFaixa,
}: {
  empresaId: string;
  usaEntrada: boolean;
  /** URL da foto da tela de entrada (nula = paisagem do Raion). */
  imagemEntrada: string | null;
  /** URL da foto própria da faixa, se houver. */
  imagemFaixa: string | null;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [usaEntrada, setUsaEntrada] = useState(usaEntradaInicial);
  const [foto, setFoto] = useState<FotoEscolhida | null>(null);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => () => void (foto && URL.revokeObjectURL(foto.url)), [foto]);

  const previa = (usaEntrada ? imagemEntrada : (foto?.url ?? imagemFaixa)) ?? IMAGEM_PADRAO_ENTRADA;

  async function escolher(arquivo: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    setResultado(null);
    const r = await escolherFotoEntrada(arquivo);
    if (r.ok) setFoto(r.foto);
    else setResultado({ ok: false, mensagem: r.mensagem });
  }

  async function salvar() {
    setResultado(null);
    setSalvando(true);
    let imagemNova: string | null = null;
    let gravou = false;
    try {
      if (!usaEntrada && foto) {
        imagemNova = await enviarFotoEntrada(empresaId, foto);
        if (!imagemNova) {
          setResultado({ ok: false, mensagem: "Não foi possível enviar a imagem. Tente de novo." });
          return;
        }
      }
      const r = await salvarFaixa({ usaEntrada, imagemNova });
      gravou = true;
      setResultado(r);
      if (r?.ok) setFoto(null);
    } catch (erro) {
      if (imagemNova && !gravou) await descartarFotoEntrada(imagemNova);
      setResultado({ ok: false, mensagem: erro instanceof Error ? erro.message : "Não foi possível salvar. Tente de novo." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao titulo="Faixa do topo">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-2">Aparece atrás do título de cada tela, escurecida com a cor da barra.</p>
        <div className="relative h-40 overflow-hidden rounded-xl bg-carvao" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou do bucket público */}
          <img src={previa} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-carvao from-10% to-transparent" />
          <p className="absolute bottom-3 left-4 font-titulo text-xl font-light text-offwhite">Bom dia</p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={usaEntrada} onChange={(e) => setUsaEntrada(e.target.checked)} className="size-4" />
          Usar a mesma imagem da tela de entrada
        </label>
        {!usaEntrada && (
          <div className="flex flex-wrap items-center gap-3">
            <input ref={entrada} type="file" accept={TIPOS_IMAGEM_ACEITOS.join(",")} className="sr-only" onChange={(e) => escolher(e.target.files?.[0])} id="foto-faixa" />
            <label htmlFor="foto-faixa" className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-linha bg-superficie px-4 text-sm">
              {foto || imagemFaixa ? "Trocar foto da faixa" : "Escolher foto da faixa"}
            </label>
            <span className="text-xs text-texto-2">{DICA_IMAGEM_ENTRADA}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar faixa"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </div>
    </Cartao>
  );
}
