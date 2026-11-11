"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { LogoRaion } from "@/components/marca";
import { Botao, CLASSE_ENTRADA, Cartao, FOCO, Mensagem } from "@/components/ui";
import { descartarFotoEntrada, enviarFotoEntrada, escolherFotoEntrada, type FotoEscolhida } from "@/lib/imagem-entrada-navegador";
import { TIPOS_IMAGEM_ACEITOS } from "@/lib/imagem-upload";
import { DICA_IMAGEM_ENTRADA, FRASE_PADRAO_ENTRADA, LIMITE_FRASE_ENTRADA, LIMITE_TEXTO_ENTRADA, TEXTO_PADRAO_ENTRADA } from "@/lib/tela-entrada";
import type { ResultadoAcao } from "@/lib/tipos";
import { salvarTelaEntrada, voltarTelaEntradaAoPadrao } from "./actions";

/**
 * Imagem, frase e texto da tela de entrada, com a prévia ao lado (desenho "Configurações · Tela de
 * entrada"). A foto nova é reduzida no navegador (até 2400 px) e enviada direto ao bucket público só
 * ao salvar; a ação grava o caminho e apaga a foto anterior.
 */
export function FormularioTelaEntrada({
  empresaId,
  frase: fraseInicial,
  texto: textoInicial,
  imagem,
  nomeImagem,
  personalizada,
}: {
  empresaId: string;
  frase: string;
  texto: string;
  imagem: string;
  nomeImagem: string;
  personalizada: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [frase, setFrase] = useState(fraseInicial);
  const [texto, setTexto] = useState(textoInicial);
  const [foto, setFoto] = useState<FotoEscolhida | null>(null);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [salvando, setSalvando] = useState(false);
  const [voltando, iniciarVolta] = useTransition();

  // Solta a URL temporária da foto escolhida quando ela sai da tela.
  useEffect(() => () => void (foto && URL.revokeObjectURL(foto.url)), [foto]);

  async function escolher(selecionado: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!selecionado) return;
    setResultado(null);
    const r = await escolherFotoEntrada(selecionado);
    if (r.ok) setFoto(r.foto);
    else setResultado({ ok: false, mensagem: r.mensagem });
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setResultado(null);
    setSalvando(true);
    let imagemNova: string | null = null;
    let gravou = false;
    try {
      if (foto) {
        imagemNova = await enviarFotoEntrada(empresaId, foto);
        if (!imagemNova) {
          setResultado({ ok: false, mensagem: "Não foi possível enviar a imagem. Tente de novo." });
          return;
        }
      }
      const salvo = await salvarTelaEntrada({ frase, texto, imagemNova });
      // Respondida, a ação já cuidou da foto enviada (grava ou apaga).
      gravou = true;
      setResultado(salvo);
      if (salvo?.ok) setFoto(null);
    } catch (erro) {
      // Falha de rede depois do envio: tenta não deixar a foto sem uso no bucket.
      if (imagemNova && !gravou) await descartarFotoEntrada(imagemNova);
      setResultado({ ok: false, mensagem: erro instanceof Error ? erro.message : "Não foi possível salvar. Tente de novo." });
    } finally {
      setSalvando(false);
    }
  }

  function voltarAoPadrao() {
    setResultado(null);
    iniciarVolta(async () => {
      const r = await voltarTelaEntradaAoPadrao();
      setResultado(r);
      if (r?.ok) {
        setFoto(null);
        // Campo vazio = padrão do Raion (aparece como sugestão no campo e na prévia).
        setFrase("");
        setTexto("");
      }
    });
  }

  const ocupado = salvando || voltando;
  const imagemPrevia = foto?.url ?? imagem;
  const fraseVista = frase.trim() || FRASE_PADRAO_ENTRADA;
  const textoVisto = texto.trim() || TEXTO_PADRAO_ENTRADA;

  return (
    <div className="flex flex-col gap-6">
      <Cartao
        titulo="Imagem e textos"
        acao={
          personalizada && (
            <button
              type="button"
              onClick={voltarAoPadrao}
              disabled={ocupado}
              className={`rounded text-sm text-texto-2 underline-offset-2 hover:text-texto hover:underline disabled:opacity-50 ${FOCO}`}
            >
              {voltando ? "Voltando…" : "Voltar ao padrão"}
            </button>
          )
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Imagem de fundo</span>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border-[1.5px] border-dashed border-linha p-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de foto local (blob) ou do Storage */}
              <img src={imagemPrevia} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover object-[65%_center]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-texto">{foto ? foto.arquivo.name : nomeImagem}</p>
                <p className="text-xs text-texto-2">{DICA_IMAGEM_ENTRADA}. A foto é escurecida embaixo para o texto ficar legível.</p>
              </div>
              <Botao type="button" variante="secundario" disabled={ocupado} onClick={() => entrada.current?.click()}>
                <ImageUp size={16} className="mr-1.5" aria-hidden />
                Trocar imagem
              </Botao>
              <input
                ref={entrada}
                type="file"
                accept={TIPOS_IMAGEM_ACEITOS.join(",")}
                tabIndex={-1}
                aria-hidden
                className="hidden"
                onChange={(e) => void escolher(e.target.files?.[0])}
              />
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Frase principal</span>
            <input
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              maxLength={LIMITE_FRASE_ENTRADA}
              placeholder={FRASE_PADRAO_ENTRADA}
              aria-describedby="frase-limite"
              className={CLASSE_ENTRADA}
            />
            <span id="frase-limite" className="text-xs text-texto-2">
              Até {LIMITE_FRASE_ENTRADA} caracteres ({frase.length}/{LIMITE_FRASE_ENTRADA}).
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Texto de apoio</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={LIMITE_TEXTO_ENTRADA}
              placeholder={TEXTO_PADRAO_ENTRADA}
              rows={3}
              aria-describedby="texto-limite"
              className={`${CLASSE_ENTRADA} resize-y`}
            />
            <span id="texto-limite" className="text-xs text-texto-2">
              Até {LIMITE_TEXTO_ENTRADA} caracteres ({texto.length}/{LIMITE_TEXTO_ENTRADA}).
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-linha pt-4">
            <Mensagem resultado={resultado} />
            <Botao type="submit" disabled={ocupado}>
              {salvando ? (foto ? "Enviando a imagem…" : "Salvando…") : "Salvar"}
            </Botao>
          </div>
        </form>
      </Cartao>

      <Cartao titulo="Como a equipe vai ver">
        <div aria-hidden className="mx-auto flex h-80 max-w-2xl overflow-hidden rounded-2xl ring-1 ring-linha">
          <div className="relative w-1/2 bg-carvao text-offwhite">
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia de foto local (blob) ou do Storage */}
            <img src={imagemPrevia} alt="" className="absolute inset-0 h-full w-full object-cover object-[65%_center] opacity-85" />
            <div className="absolute inset-0 bg-linear-to-t from-carvao to-carvao/25" />
            <div className="absolute inset-x-4 bottom-4">
              <p className="font-titulo text-[17px] leading-tight font-light text-balance">{fraseVista}</p>
              <span className="my-2.5 block h-px w-7 bg-dourado" />
              <p className="line-clamp-2 text-[10px] text-offwhite/80">{textoVisto}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-2 bg-offwhite p-5">
            <div className="mb-1.5 flex">
              <LogoRaion altura={14} />
            </div>
            <b className="font-titulo text-xl font-light text-carvao">Entrar</b>
            <i className="block h-5.5 rounded-lg bg-white ring-1 ring-cinza-claro" />
            <i className="block h-5.5 rounded-lg bg-white ring-1 ring-cinza-claro" />
            <i className="block h-5.5 rounded-full bg-dourado" />
          </div>
        </div>
        <p className="mt-3 text-xs text-texto-2">Vale para Entrar, Recuperar senha, Crie sua senha e Sem acesso.</p>
      </Cartao>
    </div>
  );
}
