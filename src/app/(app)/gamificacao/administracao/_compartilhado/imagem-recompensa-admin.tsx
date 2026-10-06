"use client";

import { useRef, useState, useTransition } from "react";
import { Gift, ImagePlus } from "lucide-react";
import { Botao, Mensagem } from "@/components/ui";
import {
  DICA_IMAGEM,
  montarCaminhoImagemRecompensa,
  TIPOS_IMAGEM_ACEITOS,
  validarArquivoImagem,
} from "@/lib/imagem-upload";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { EditorImagem } from "../../_compartilhado/editor-imagem";
import { ImagemRecompensaGf } from "../../_compartilhado/imagem-recompensa-gf";
import type { ImagemRecortada } from "../../_compartilhado/recortar-imagem";
import { definirImagemRecompensa, removerImagemRecompensa } from "./actions";

const BUCKET = "recompensas";

/**
 * Imagem da recompensa no cartão de edição: miniatura 4:3 (ou ícone), enviar/trocar e remover.
 * O arquivo é escolhido, validado (tipo e 3 MB), recortado em 4:3 no navegador e enviado DIRETO
 * ao bucket privado; depois a server action grava o caminho (e apaga o arquivo anterior).
 */
export function ImagemRecompensaAdmin({
  empresaId,
  recompensaId,
  nome,
  imagemUrl,
  temImagem,
}: {
  empresaId: string;
  recompensaId: string;
  nome: string;
  imagemUrl: string | null;
  temImagem: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [removendo, iniciarRemocao] = useTransition();

  function escolher(selecionado: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!selecionado) return;
    const erro = validarArquivoImagem(selecionado);
    if (erro) {
      setResultado({ ok: false, mensagem: erro });
      return;
    }
    setResultado(null);
    setErroEnvio(null);
    setArquivo(selecionado);
  }

  async function enviar(imagem: ImagemRecortada) {
    setErroEnvio(null);
    setEnviando(true);
    const supabase = criarClienteNavegador();
    const caminho = montarCaminhoImagemRecompensa(empresaId, recompensaId, imagem.extensao, crypto.randomUUID());
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, imagem.blob, {
        contentType: imagem.tipo,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        setErroEnvio("Não foi possível enviar a imagem. Tente de novo.");
        return;
      }
      try {
        const salvo = await definirImagemRecompensa(recompensaId, caminho);
        if (!salvo.ok) {
          // A action já apaga o arquivo enviado quando não consegue gravar.
          setErroEnvio(salvo.mensagem);
          return;
        }
        setArquivo(null);
        setResultado(salvo);
      } catch {
        // Falha de rede após o upload: tenta não deixar o arquivo órfão.
        await supabase.storage.from(BUCKET).remove([caminho]);
        setErroEnvio("Não foi possível salvar a imagem. Tente de novo.");
      }
    } catch {
      setErroEnvio("Não foi possível enviar a imagem. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  function remover() {
    setResultado(null);
    iniciarRemocao(async () => {
      try {
        setResultado(await removerImagemRecompensa(recompensaId));
      } catch {
        setResultado({ ok: false, mensagem: "Não foi possível remover a imagem." });
      }
    });
  }

  const placeholder = (
    <span
      role="img"
      aria-label="Recompensa sem imagem"
      className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-[var(--gf-neutro-barra)] bg-[var(--gf-surface)] text-[var(--gf-texto-ter)]"
    >
      <Gift size={28} aria-hidden />
    </span>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="w-40 shrink-0">
        <ImagemRecompensaGf
          url={imagemUrl}
          alt={`Imagem da recompensa ${nome}`}
          className="aspect-[4/3] w-full rounded-lg border border-[var(--gf-borda)]"
          fallback={placeholder}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[0.8125rem] leading-snug font-medium text-[var(--gf-texto)]">Imagem da recompensa</p>
        <p className="gf-t-micro">{DICA_IMAGEM}. Você poderá enquadrar a imagem antes de enviar.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_IMAGEM_ACEITOS.join(",")}
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <Botao type="button" variante="secundario" disabled={removendo || enviando} onClick={() => entrada.current?.click()}>
            <ImagePlus size={16} aria-hidden className="mr-2" />
            {temImagem ? "Trocar imagem" : "Enviar imagem"}
          </Botao>
          {temImagem && (
            <button type="button" className="gf-botao-texto" disabled={removendo || enviando} onClick={remover}>
              {removendo ? "Removendo…" : "Remover imagem"}
            </button>
          )}
        </div>
        <Mensagem resultado={resultado} />
      </div>

      {arquivo && (
        <EditorImagem
          arquivo={arquivo}
          titulo={`Enquadrar imagem de “${nome}”`}
          aspecto={4 / 3}
          enviando={enviando}
          erro={erroEnvio}
          rotuloConfirmar="Enviar imagem"
          onConfirmar={enviar}
          onCancelar={() => {
            setArquivo(null);
            setErroEnvio(null);
          }}
        />
      )}
    </div>
  );
}
