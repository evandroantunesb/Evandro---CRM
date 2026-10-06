"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Camera, ImagePlus, Pencil, RefreshCw, Trash2, X } from "lucide-react";

/**
 * Gatilho + menu de gerenciamento da imagem da recompensa. A miniatura (ou o placeholder) é o
 * botão: no desktop abre um menu pequeno ancorado a ela; no celular (<768 px, decidido por CSS em
 * `gamificacao.css`) o MESMO menu vira um painel inferior com itens de toque confortável.
 * Sem imagem só há "Adicionar imagem". "Excluir" pede um segundo passo de confirmação no próprio
 * menu. Esc fecha e devolve o foco ao gatilho; setas/Home/End navegam; clicar fora fecha.
 */
export function MenuImagemRecompensa({
  temImagem,
  desabilitado,
  nome,
  onAdicionar,
  onEditar,
  onExcluir,
  children,
}: {
  temImagem: boolean;
  desabilitado: boolean;
  nome: string;
  onAdicionar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  /** Conteúdo visual do gatilho (miniatura ou placeholder). */
  children: ReactNode;
}) {
  const idMenu = useId();
  const gatilho = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const [ancora, setAncora] = useState({ x: 0, y: 0 });
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  function fechar(devolverFoco = true) {
    setAberto(false);
    setConfirmando(false);
    if (devolverFoco) gatilho.current?.focus();
  }

  // A camada (fundo + menu) vive na top layer (Popover API): `position: fixed` dentro do container
  // `@container` do tema seria relativo a ele, não à janela. No desktop o menu acompanha a miniatura
  // por coordenadas (variáveis CSS); no celular o CSS ignora as coordenadas e usa o painel inferior.
  useEffect(() => {
    if (!aberto) return;
    const el = camada.current;
    if (el && typeof el.showPopover === "function" && !el.matches(":popover-open")) el.showPopover();
    const medir = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (r) setAncora({ x: r.left, y: r.bottom });
    };
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
      if (el?.matches(":popover-open")) el.hidePopover();
    };
  }, [aberto]);

  // Ao abrir (ou ao mudar de passo), foca o item que deve ser lido primeiro.
  useEffect(() => {
    if (!aberto) return;
    const itens = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    // Na confirmação o foco vai para "Cancelar" (o último), a opção segura.
    (confirmando ? itens?.[itens.length - 1] : itens?.[0])?.focus();
  }, [aberto, confirmando]);

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }
    if (e.key === "Tab") {
      // Menu simples: Tab sai dele e fecha (o foco segue a ordem natural da página).
      fechar(false);
      return;
    }
    const itens = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    let destino = -1;
    if (e.key === "ArrowDown") destino = (atual + 1) % itens.length;
    else if (e.key === "ArrowUp") destino = (atual - 1 + itens.length) % itens.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = itens.length - 1;
    if (destino >= 0) {
      e.preventDefault();
      itens[destino]?.focus();
    }
  }

  /** Fecha o menu e executa a ação (o foco volta ao gatilho antes de abrir seletor/janela). */
  function escolher(acao: () => void) {
    fechar();
    acao();
  }

  const rotuloGatilho = temImagem ? `Gerenciar imagem da recompensa ${nome}` : `Adicionar imagem da recompensa ${nome}`;

  return (
    <div className="relative">
      <button
        ref={gatilho}
        type="button"
        disabled={desabilitado}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={rotuloGatilho}
        className="gf-imagem-gatilho"
        onClick={() => (aberto ? fechar(false) : setAberto(true))}
      >
        {children}
        <span className={`gf-imagem-overlay${temImagem ? "" : " gf-imagem-overlay-vazio"}`} aria-hidden>
          {temImagem ? <Pencil size={18} /> : <ImagePlus size={18} />}
          {temImagem ? "Gerenciar imagem" : "Adicionar imagem"}
        </span>
        <span className="gf-imagem-selo" aria-hidden>
          <Camera size={14} />
        </span>
      </button>

      {aberto && (
        <div ref={camada} popover="manual" className="gf-menu-camada">
          <div className="gf-menu-fundo" aria-hidden onClick={() => fechar(false)} />
          <div
            ref={menu}
            id={idMenu}
            role="menu"
            aria-label={confirmando ? "Confirmar exclusão da imagem" : "Gerenciar imagem"}
            className="gf-menu-imagem"
            style={{ "--gf-menu-x": `${ancora.x}px`, "--gf-menu-y": `${ancora.y}px` } as CSSProperties}
            onKeyDown={aoTeclar}
          >
            <div className="gf-menu-titulo" aria-hidden>
              <span>{confirmando ? "Excluir imagem?" : temImagem ? "Gerenciar imagem" : "Adicionar imagem"}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Fechar"
                onClick={() => fechar()}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--gf-texto-sec)]"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            {confirmando ? (
              <>
                <p className="px-3 py-2 text-[0.8125rem] leading-snug text-[var(--gf-texto-sec)]">
                  A imagem será removida da recompensa.
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="gf-menu-item gf-menu-item-perigo"
                  onClick={() => escolher(onExcluir)}
                >
                  <Trash2 size={16} aria-hidden /> Confirmar exclusão
                </button>
                <button type="button" role="menuitem" className="gf-menu-item" onClick={() => setConfirmando(false)}>
                  <X size={16} aria-hidden /> Cancelar
                </button>
              </>
            ) : temImagem ? (
              <>
                <button type="button" role="menuitem" className="gf-menu-item" onClick={() => escolher(onEditar)}>
                  <Pencil size={16} aria-hidden /> Editar imagem
                </button>
                <button type="button" role="menuitem" className="gf-menu-item" onClick={() => escolher(onAdicionar)}>
                  <RefreshCw size={16} aria-hidden /> Substituir imagem
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="gf-menu-item gf-menu-item-perigo"
                  onClick={() => setConfirmando(true)}
                >
                  <Trash2 size={16} aria-hidden /> Excluir imagem
                </button>
              </>
            ) : (
              <button type="button" role="menuitem" className="gf-menu-item" onClick={() => escolher(onAdicionar)}>
                <ImagePlus size={16} aria-hidden /> Adicionar imagem
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
