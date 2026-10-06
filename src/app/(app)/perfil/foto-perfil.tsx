"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { EditorImagem } from "@/components/editor-imagem";
import { Botao, Mensagem } from "@/components/ui";
import { BUCKET_AVATARES, DICA_IMAGEM, montarCaminhoAvatar, SAIDA_AVATAR, TIPOS_IMAGEM_ACEITOS, validarArquivoImagem } from "@/lib/imagem-upload";
import type { ImagemRecortada } from "@/lib/recortar-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { definirAvatar, removerAvatar } from "./actions";

/**
 * Foto de perfil do usuário (vale em todas as empresas). O arquivo é escolhido, validado (tipo e 3 MB),
 * recortado em quadrado 512x512 no navegador (máscara circular) e enviado DIRETO ao bucket privado
 * `avatares`; depois a server action grava o caminho (e apaga o arquivo anterior). `avatarUrl` é a URL
 * assinada da foto atual, gerada pela página; sem ela (ou se falhar ao carregar) aparecem as iniciais.
 */
export function FotoPerfil({
  userId,
  nome,
  avatarUrl,
  temFoto,
}: {
  userId: string;
  nome: string;
  avatarUrl: string | null;
  temFoto: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, iniciarRemocao] = useTransition();
  const ocupado = enviando || removendo;

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
    setConfirmando(false);
    setArquivo(selecionado);
  }

  async function enviar(imagem: ImagemRecortada) {
    setErroEnvio(null);
    setEnviando(true);
    const supabase = criarClienteNavegador();
    const caminho = montarCaminhoAvatar(userId, imagem.extensao, crypto.randomUUID());
    try {
      const { error } = await supabase.storage.from(BUCKET_AVATARES).upload(caminho, imagem.blob, {
        contentType: imagem.tipo,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        setErroEnvio("Não foi possível enviar a foto. Tente de novo.");
        return;
      }
      try {
        const salvo = await definirAvatar(caminho);
        if (!salvo.ok) {
          // A action já apaga o arquivo enviado quando não consegue gravar.
          setErroEnvio(salvo.mensagem);
          return;
        }
        setArquivo(null);
        setResultado(salvo);
      } catch {
        // Falha de rede após o upload: tenta não deixar o arquivo órfão.
        await supabase.storage.from(BUCKET_AVATARES).remove([caminho]);
        setErroEnvio("Não foi possível salvar a foto. Tente de novo.");
      }
    } catch {
      setErroEnvio("Não foi possível enviar a foto. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  function remover() {
    setResultado(null);
    setConfirmando(false);
    iniciarRemocao(async () => {
      try {
        setResultado(await removerAvatar());
      } catch {
        setResultado({ ok: false, mensagem: "Não foi possível remover a foto." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex justify-center sm:justify-start">
        <Avatar nome={nome} tamanho={96} src={avatarUrl} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-zinc-600">
          Sua foto aparece para as pessoas das suas empresas (menu, rankings e metas). {DICA_IMAGEM}; você poderá enquadrá-la antes de enviar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="button" variante="secundario" disabled={ocupado} onClick={() => entrada.current?.click()} className="min-h-11">
            {temFoto ? "Trocar foto" : "Adicionar foto"}
          </Botao>
          {temFoto && !confirmando && (
            <Botao type="button" variante="perigo" disabled={ocupado} onClick={() => setConfirmando(true)} className="min-h-11">
              Remover foto
            </Botao>
          )}
        </div>
        {confirmando && (
          <div role="group" aria-label="Confirmar remoção da foto" className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-red-800">Remover sua foto? Voltarão a aparecer as suas iniciais.</p>
            <div className="flex gap-2">
              <Botao type="button" variante="perigo" disabled={ocupado} onClick={remover} className="min-h-11">
                Sim, remover
              </Botao>
              <Botao type="button" variante="secundario" disabled={ocupado} onClick={() => setConfirmando(false)} className="min-h-11">
                Cancelar
              </Botao>
            </div>
          </div>
        )}
        {removendo && (
          <p role="status" className="text-xs text-zinc-500">
            Removendo…
          </p>
        )}
        <Mensagem resultado={resultado} />
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

      {arquivo && (
        <EditorImagem
          arquivo={arquivo}
          titulo="Ajustar sua foto de perfil"
          aspecto={1}
          mascara="circulo"
          tema="claro"
          saidaExata={SAIDA_AVATAR}
          enviando={enviando}
          erro={erroEnvio}
          rotuloConfirmar="Usar esta foto"
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
