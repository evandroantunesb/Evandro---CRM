"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { FOCO } from "@/components/ui";
import { apagarFotoEtapa, registrarFotoEtapa } from "@/lib/acoes/obra-solo";
import type { EtapaChecklist } from "@/lib/obras/checklist";
import type { FotoEtapaVM } from "@/lib/obras/solo-dados";
import { validarArquivoImagem } from "@/lib/imagem-upload";
import { recortarImagem } from "@/lib/recortar-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

const LIMITE_FOTOS = 10;
/** Teto do arquivo escolhido (foto do celular); depois de reduzida, a foto precisa caber nos 3 MB do Storage. */
const LIMITE_ORIGINAL_BYTES = 25 * 1024 * 1024;
const DICA_FOTO = "JPG, PNG ou WebP até 25 MB";

/** Lê as dimensões da imagem para comprimir sem recortar. */
function dimensoes(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    img.src = src;
  });
}

/**
 * Fotos de uma etapa (até 10): comprimidas no navegador como as imagens de hoje, enviadas para o bucket privado
 * `obra-fotos` na pasta da obra e registradas no banco. Apagar pede confirmação.
 */
export function FotosEtapa({ empresaId, obraId, etapa, fotos }: { empresaId: string; obraId: string; etapa: EtapaChecklist; fotos: FotoEtapaVM[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const cheio = fotos.length >= LIMITE_FOTOS;

  async function enviar(arquivo: File) {
    setErro(null);
    const invalido = validarArquivoImagem(arquivo, LIMITE_ORIGINAL_BYTES);
    if (invalido) return setErro(invalido);
    const url = URL.createObjectURL(arquivo);
    try {
      const { width, height } = await dimensoes(url);
      const imagem = await recortarImagem(url, { x: 0, y: 0, width, height });
      const grande = validarArquivoImagem({ type: imagem.tipo, size: imagem.blob.size });
      if (grande) return setErro(grande);
      const caminho = `${empresaId}/${obraId}/${etapa}/${crypto.randomUUID()}.${imagem.extensao}`;
      const { error } = await criarClienteNavegador().storage.from("obra-fotos").upload(caminho, imagem.blob, { contentType: imagem.tipo });
      if (error) return setErro("Não foi possível enviar a foto.");
      const r = await registrarFotoEtapa(obraId, etapa, caminho);
      if (!r?.ok) {
        await criarClienteNavegador().storage.from("obra-fotos").remove([caminho]);
        setErro(r?.mensagem ?? "Não foi possível guardar a foto.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {fotos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {fotos.map((f) => (
            <li key={f.id} className="group relative">
              {f.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração do Storage
                <img src={f.url} alt="Foto da etapa" className="h-[42px] w-14 rounded-lg object-cover" />
              ) : (
                <span className="block h-[42px] w-14 rounded-lg bg-superficie-2" />
              )}
              <button
                type="button"
                disabled={pendente}
                aria-label="Apagar foto"
                onClick={() => {
                  if (!confirm("Apagar esta foto? O cliente também deixa de ver.")) return;
                  iniciar(async () => {
                    const r = await apagarFotoEtapa(obraId, f.id);
                    if (!r?.ok) setErro(r?.mensagem ?? "Não foi possível apagar a foto.");
                  });
                }}
                className={`absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-carvao text-offwhite opacity-90 ${FOCO}`}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendente || cheio}
          onClick={() => entrada.current?.click()}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-sm font-medium text-texto hover:border-dourado disabled:opacity-50 ${FOCO}`}
        >
          <ImagePlus size={15} aria-hidden />
          {pendente ? "Enviando..." : "Adicionar foto"}
        </button>
        <span className="text-xs text-texto-2">{cheio ? "Limite de 10 fotos nesta etapa." : DICA_FOTO}</span>
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher foto"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) iniciar(() => enviar(arquivo));
          }}
        />
      </div>
      {erro && (
        <p role="alert" className="text-xs text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
