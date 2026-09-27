"use client";

import { useActionState, useRef, useState } from "react";
import { Botao, Campo, Cartao, Mensagem } from "@/components/ui";
import { salvarIdentidadeProposta } from "@/lib/acoes/proposta-identidade";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

const LIMITE = 5 * 1024 * 1024;

function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-60);
  return `${crypto.randomUUID()}-${limpo || "imagem"}`;
}

type Identidade = {
  nomeExibicao: string;
  corPrimaria: string;
  corDestaque: string;
  whatsapp: string;
  rodapeTexto: string;
  logoCaminho: string | null;
  logoEscuroCaminho: string | null;
  fotoCapaCaminho: string | null;
};

function CampoImagem({
  empresaId,
  rotulo,
  descricao,
  campo,
  caminho,
  setCaminho,
  previewUrl,
}: {
  empresaId: string;
  rotulo: string;
  descricao: string;
  campo: string;
  caminho: string | null;
  setCaminho: (v: string | null) => void;
  previewUrl: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.size > LIMITE) {
      setErro("A imagem passa de 5 MB.");
      return;
    }
    setErro(null);
    setEnviando(true);
    const supabase = criarClienteNavegador();
    const caminhoNovo = `${empresaId}/${nomeSeguro(arquivo.name)}`;
    const { error } = await supabase.storage.from("proposta-marca").upload(caminhoNovo, arquivo, { contentType: arquivo.type || undefined });
    if (error) {
      setErro("Não foi possível enviar a imagem.");
    } else {
      setPreviewLocal(URL.createObjectURL(arquivo));
      setCaminho(caminhoNovo);
    }
    setEnviando(false);
    if (input.current) input.current.value = "";
  }

  const mostrar = previewLocal ?? previewUrl;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700">{rotulo}</span>
      <p className="text-xs text-zinc-500">{descricao}</p>
      <div className="flex items-center gap-3">
        {mostrar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mostrar} alt={rotulo} className="h-14 w-14 rounded-lg border border-zinc-200 object-contain bg-zinc-50" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-400">Sem imagem</div>
        )}
        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:border-dourado">
          {enviando ? "Enviando..." : "Trocar imagem"}
          <input ref={input} type="file" accept="image/*" disabled={enviando} className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
        </label>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      {caminho && <input type="hidden" name={campo} value={caminho} />}
    </div>
  );
}

export function FormIdentidade({
  empresaId,
  identidade,
  preview,
}: {
  empresaId: string;
  identidade: Identidade;
  preview: { logoUrl: string | null; logoEscuroUrl: string | null; fotoCapaUrl: string | null };
}) {
  const [resultado, acao, salvando] = useActionState(salvarIdentidadeProposta, null);
  const [logoCaminho, setLogoCaminho] = useState(identidade.logoCaminho);
  const [logoEscuroCaminho, setLogoEscuroCaminho] = useState(identidade.logoEscuroCaminho);
  const [fotoCapaCaminho, setFotoCapaCaminho] = useState(identidade.fotoCapaCaminho);
  const [corPrimaria, setCorPrimaria] = useState(identidade.corPrimaria || "#0F0F10");
  const [corDestaque, setCorDestaque] = useState(identidade.corDestaque || "#D4AF37");

  return (
    <Cartao titulo="Identidade visual da proposta">
      <form action={acao} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600">
          Usada nas propostas emitidas para os clientes. Sem essas informações, a proposta usa o nome da empresa em texto simples e as cores padrão — nunca a
          marca Raion.
        </p>
        <Campo rotulo="Nome de exibição" name="nome_exibicao" defaultValue={identidade.nomeExibicao} placeholder="Ex.: Sol Energia Solar" maxLength={120} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CampoImagem
            empresaId={empresaId}
            rotulo="Logo (fundo claro)"
            descricao="Aparece sobre fundos claros."
            campo="logo_url"
            caminho={logoCaminho}
            setCaminho={setLogoCaminho}
            previewUrl={preview.logoUrl}
          />
          <CampoImagem
            empresaId={empresaId}
            rotulo="Logo (fundo escuro)"
            descricao="Usada na faixa de fechamento."
            campo="logo_escuro_url"
            caminho={logoEscuroCaminho}
            setCaminho={setLogoEscuroCaminho}
            previewUrl={preview.logoEscuroUrl}
          />
          <CampoImagem
            empresaId={empresaId}
            rotulo="Foto de capa padrão"
            descricao="Usada na capa modelo &quot;foto&quot; quando o modelo não tem uma própria."
            campo="foto_capa_url"
            caminho={fotoCapaCaminho}
            setCaminho={setFotoCapaCaminho}
            previewUrl={preview.fotoCapaUrl}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Cor primária</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(corPrimaria) ? corPrimaria : "#0F0F10"}
                onChange={(e) => setCorPrimaria(e.target.value)}
                className="h-9 w-9 rounded border border-zinc-200"
                aria-label="Selecionar cor primária"
              />
              <input
                type="text"
                name="cor_primaria"
                value={corPrimaria}
                onChange={(e) => setCorPrimaria(e.target.value)}
                placeholder="#0F0F10"
                pattern="^#[0-9a-fA-F]{6}$"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Cor de destaque</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(corDestaque) ? corDestaque : "#D4AF37"}
                onChange={(e) => setCorDestaque(e.target.value)}
                className="h-9 w-9 rounded border border-zinc-200"
                aria-label="Selecionar cor de destaque"
              />
              <input
                type="text"
                name="cor_destaque"
                value={corDestaque}
                onChange={(e) => setCorDestaque(e.target.value)}
                placeholder="#D4AF37"
                pattern="^#[0-9a-fA-F]{6}$"
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
              />
            </div>
          </label>
        </div>
        <Campo rotulo="WhatsApp de contato (com DDI/DDD, só números)" name="whatsapp" defaultValue={identidade.whatsapp} placeholder="5545999999999" maxLength={30} />
        <Campo rotulo="Texto de rodapé (opcional)" name="rodape_texto" defaultValue={identidade.rodapeTexto} maxLength={200} />
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={salvando} className="self-start">
          {salvando ? "Salvando..." : "Salvar identidade"}
        </Botao>
      </form>
    </Cartao>
  );
}
