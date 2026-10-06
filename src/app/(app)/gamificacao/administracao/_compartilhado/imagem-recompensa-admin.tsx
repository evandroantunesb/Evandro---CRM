"use client";

import { useRef, useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { Mensagem } from "@/components/ui";
import {
  DICA_IMAGEM,
  montarCaminhoImagemRecompensa,
  TIPOS_IMAGEM_ACEITOS,
  validarArquivoImagem,
} from "@/lib/imagem-upload";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { EditorImagem } from "@/components/editor-imagem";
import { ImagemRecompensaGf } from "../../_compartilhado/imagem-recompensa-gf";
import type { ImagemRecortada } from "@/lib/recortar-imagem";
import { definirImagemRecompensa, removerImagemRecompensa } from "./actions";
import { MenuImagemRecompensa } from "./menu-imagem-recompensa";

const BUCKET = "recompensas";

/**
 * Imagem da recompensa no cartão de edição: a própria miniatura 4:3 (ou o placeholder) é o gatilho do
 * menu Editar/Substituir/Excluir (painel inferior no celular). "Editar" baixa a imagem atual pela URL
 * assinada já disponível e reabre o recorte 4:3; o envio segue o mesmo fluxo abaixo.
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
  const [carregandoAtual, setCarregandoAtual] = useState(false);

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

  /** Reabre o recorte com a imagem atual (fetch da URL assinada no navegador; sem endpoint novo). */
  async function editar() {
    if (!imagemUrl) {
      setResultado({ ok: false, mensagem: "Não foi possível carregar a imagem atual. Use “Substituir imagem”." });
      return;
    }
    setResultado(null);
    setErroEnvio(null);
    setCarregandoAtual(true);
    try {
      const resposta = await fetch(imagemUrl);
      if (!resposta.ok) throw new Error("falha");
      const blob = await resposta.blob();
      if (!blob.type.startsWith("image/")) throw new Error("tipo");
      const extensao = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
      setArquivo(new File([blob], `imagem-atual.${extensao}`, { type: blob.type }));
    } catch {
      setResultado({ ok: false, mensagem: "Não foi possível carregar a imagem atual. Use “Substituir imagem”." });
    } finally {
      setCarregandoAtual(false);
    }
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
        <MenuImagemRecompensa
          temImagem={temImagem}
          nome={nome}
          desabilitado={removendo || enviando || carregandoAtual}
          onAdicionar={() => entrada.current?.click()}
          onEditar={editar}
          onExcluir={remover}
        >
          <ImagemRecompensaGf
            url={imagemUrl}
            alt={`Imagem da recompensa ${nome}`}
            className="aspect-[4/3] w-full rounded-lg border border-[var(--gf-borda)]"
            fallback={placeholder}
          />
        </MenuImagemRecompensa>
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_IMAGEM_ACEITOS.join(",")}
          tabIndex={-1}
          aria-hidden
          className="hidden"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[0.8125rem] leading-snug font-medium text-[var(--gf-texto)]">Imagem da recompensa</p>
        <p className="gf-t-micro">
          {DICA_IMAGEM}. Toque na imagem para gerenciar; você poderá enquadrá-la antes de enviar.
        </p>
        {carregandoAtual && (
          <p role="status" className="gf-t-micro">
            Carregando a imagem atual…
          </p>
        )}
        {removendo && (
          <p role="status" className="gf-t-micro">
            Removendo…
          </p>
        )}
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
