"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Minus, Plus } from "lucide-react";
import { Botao } from "@/components/ui";
import { recortarImagem, type AreaRecorte, type ImagemRecortada } from "@/lib/recortar-imagem";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.1;

/**
 * Estilos por tema. "gamificacao" usa as variáveis `--gf-*` e as classes `gf-t-*` (só existem
 * dentro de `.tema-gamificacao`); "claro" usa a identidade padrão do app, para telas fora do módulo.
 */
const TEMAS = {
  gamificacao: {
    dialogo:
      "border-[var(--gf-borda)] bg-[var(--gf-surface)] text-[var(--gf-texto)]",
    titulo: "gf-t-item text-base",
    aux: "gf-t-aux",
    rotulo: "text-[var(--gf-texto)]",
    botaoZoom:
      "border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] text-[var(--gf-texto)] hover:border-[var(--gf-verde)]",
    faixa: "accent-[var(--gf-verde)]",
    erro: "bg-[var(--gf-vermelho-10)] text-[var(--gf-vermelho)]",
    rodape: "border-[var(--gf-borda)]",
    bordaRecorte: "2px solid var(--gf-verde)",
  },
  claro: {
    dialogo: "border-zinc-200 bg-white text-carvao",
    titulo: "font-titulo text-base font-semibold text-carvao",
    aux: "text-[0.8125rem] leading-snug text-zinc-500",
    rotulo: "text-zinc-700",
    botaoZoom: "border-zinc-200 bg-white text-carvao hover:border-dourado",
    faixa: "accent-dourado",
    erro: "bg-red-50 text-red-800",
    rodape: "border-zinc-200",
    bordaRecorte: "2px solid var(--color-dourado)",
  },
} as const;

/**
 * Editor de recorte de imagem (janela modal): o usuário enquadra a imagem com arrastar/pinça/setas e
 * zoom; ao confirmar, o recorte é gerado no navegador (WebP, ou JPEG sem suporte) e entregue em
 * `onConfirmar`. Quem chama faz o envio e informa `enviando`/`erro`. Esc e "Cancelar" fecham
 * (exceto durante o envio).
 *
 * `aspecto` = largura/altura do recorte (4/3 nas recompensas, 1 no avatar). `mascara` define o
 * formato do enquadramento: "retangulo" ou "circulo" (o arquivo gerado continua retangular — só a
 * máscara visual muda). `saidaExata` gera a imagem final nessa dimensão (ampliando se preciso);
 * sem ela, o recorte nunca amplia e fica em no máximo 1200x900. `tema` escolhe o visual: padrão
 * "gamificacao" (escuro, dentro de `.tema-gamificacao`) ou "claro" (resto do app).
 */
export function EditorImagem({
  arquivo,
  titulo,
  aspecto = 4 / 3,
  mascara = "retangulo",
  tema = "gamificacao",
  saidaExata,
  enviando = false,
  erro = null,
  rotuloConfirmar = "Usar esta imagem",
  onConfirmar,
  onCancelar,
}: {
  arquivo: File;
  titulo: string;
  aspecto?: number;
  mascara?: "retangulo" | "circulo";
  tema?: "gamificacao" | "claro";
  saidaExata?: { largura: number; altura: number };
  enviando?: boolean;
  erro?: string | null;
  rotuloConfirmar?: string;
  onConfirmar: (imagem: ImagemRecortada) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const t = TEMAS[tema];
  const idTitulo = useId();
  const idZoom = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [posicao, setPosicao] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [area, setArea] = useState<AreaRecorte | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const ocupado = gerando || enviando;

  // O arquivo (até 3 MB, já validado) é lido como data URL: sem URL de objeto para revogar.
  useEffect(() => {
    let ativo = true;
    const leitor = new FileReader();
    leitor.onload = () => {
      if (ativo) setSrc(String(leitor.result));
    };
    leitor.onerror = () => {
      if (ativo) setErroLocal("Não foi possível abrir a imagem.");
    };
    leitor.readAsDataURL(arquivo);
    return () => {
      ativo = false;
    };
  }, [arquivo]);

  // Janela modal nativa: prende o foco, bloqueia o resto da página e devolve o foco ao fechar.
  useEffect(() => {
    const el = dialogo.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  const aoCompletar = useCallback((_: unknown, pixels: AreaRecorte) => setArea(pixels), []);

  async function confirmar() {
    if (!src || !area || ocupado) return;
    setErroLocal(null);
    setGerando(true);
    try {
      const imagem = await recortarImagem(src, area, { saidaExata });
      setGerando(false);
      await onConfirmar(imagem);
    } catch (e) {
      setGerando(false);
      setErroLocal(e instanceof Error ? e.message : "Não foi possível recortar a imagem.");
    }
  }

  const mensagemErro = erroLocal ?? erro;

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        // Esc: fecha só se não houver envio em andamento.
        e.preventDefault();
        if (!ocupado) onCancelar();
      }}
      className={`m-auto max-h-[94dvh] w-[min(94vw,40rem)] overflow-y-auto rounded-xl border p-0 shadow-2xl backdrop:bg-black/70 ${t.dialogo}`}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 id={idTitulo} className={t.titulo}>
          {titulo}
        </h2>
        <p className={t.aux}>
          Arraste a imagem para enquadrar (ou use as setas do teclado com o recorte selecionado) e ajuste o zoom.
        </p>

        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black sm:h-96">
          {src && (
            <Cropper
              image={src}
              crop={posicao}
              zoom={zoom}
              aspect={aspecto}
              minZoom={ZOOM_MIN}
              maxZoom={ZOOM_MAX}
              cropShape={mascara === "circulo" ? "round" : "rect"}
              showGrid={mascara !== "circulo"}
              objectFit="contain"
              onCropChange={setPosicao}
              onZoomChange={setZoom}
              onCropComplete={aoCompletar}
              style={{ cropAreaStyle: { border: t.bordaRecorte } }}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor={idZoom} className={`text-sm font-medium ${t.rotulo}`}>
            Zoom
          </label>
          <button
            type="button"
            aria-label="Diminuir zoom"
            disabled={ocupado || zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_PASSO) * 100) / 100))}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border disabled:opacity-50 ${t.botaoZoom}`}
          >
            <Minus size={16} aria-hidden />
          </button>
          <input
            id={idZoom}
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            disabled={ocupado}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-valuetext={`${Math.round(zoom * 100)}%`}
            className={`h-11 min-h-0 flex-1 cursor-pointer ${t.faixa}`}
          />
          <button
            type="button"
            aria-label="Aumentar zoom"
            disabled={ocupado || zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_PASSO) * 100) / 100))}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border disabled:opacity-50 ${t.botaoZoom}`}
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>

        {mensagemErro && (
          <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${t.erro}`}>
            {mensagemErro}
          </p>
        )}
        {ocupado && (
          <p role="status" className={t.aux}>
            {enviando ? "Enviando a imagem…" : "Preparando o recorte…"}
          </p>
        )}

        <div className={`flex flex-wrap items-center justify-end gap-3 border-t pt-4 ${t.rodape}`}>
          <Botao type="button" variante="secundario" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao type="button" onClick={confirmar} disabled={ocupado || !area}>
            {enviando ? "Enviando…" : gerando ? "Preparando…" : rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
