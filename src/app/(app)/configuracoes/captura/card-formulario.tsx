"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  MoreVertical,
  Share2,
  Smartphone,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useActionState, useState } from "react";
import { Mensagem } from "@/components/ui";
import { alternarFormulario, apagarFormulario } from "./actions";
import { PosterFormulario } from "./poster-formulario";

type Formulario = { id: string; nome: string; funil: string; origem: string; ativo: boolean };

function slug(nome: string) {
  return nome.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

export function CardFormulario({
  formulario,
  link,
  qrCode,
  selecionado,
  onVisualizar,
}: {
  formulario: Formulario;
  link: string;
  qrCode: string | null;
  selecionado: boolean;
  onVisualizar: () => void;
}) {
  const [resultado, acao, pendente] = useActionState(alternarFormulario, null);
  const [resultadoExcluir, acaoExcluir, excluindo] = useActionState(apagarFormulario, null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [menuCompartilhar, setMenuCompartilhar] = useState(false);
  const [menuOpcoes, setMenuOpcoes] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [modalPoster, setModalPoster] = useState(false);
  const [modalCelular, setModalCelular] = useState(false);

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 2500);
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(link);
    avisar("Link copiado!");
  }

  async function compartilhar() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Formulário ${formulario.nome}`, text: "Confira nosso formulário:", url: link });
      } catch {
        // Usuário cancelou o compartilhamento — não é um erro.
      }
      return;
    }
    setMenuCompartilhar((v) => !v);
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-white p-5 transition-colors ${
        selecionado ? "border-dourado shadow-[0_0_0_1px_rgba(212,175,55,0.4)]" : "border-zinc-200/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-carvao">
            <Users size={18} className="text-dourado" />
          </span>
          <div>
            <p className="font-medium text-zinc-900">{formulario.nome}</p>
            <p className="text-xs text-zinc-500">
              {formulario.funil} · {formulario.origem}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={acao} className="flex items-center gap-2">
            <input type="hidden" name="id" value={formulario.id} />
            <span className={`text-xs font-medium ${formulario.ativo ? "text-green-700" : "text-zinc-500"}`}>
              {formulario.ativo ? "Ativo" : "Inativo"}
            </span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={formulario.ativo}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                disabled={pendente}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-zinc-300 transition-colors peer-checked:bg-dourado peer-disabled:opacity-50" />
              <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </label>
          </form>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpcoes((v) => !v)}
              aria-label="Mais opções"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-carvao"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpcoes && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpcoes(false)} />
                <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpcoes(false);
                      setModalExcluir(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Excluir formulário
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 sm:flex-row">
        {qrCode ? (
          <div className="flex shrink-0 flex-col items-center gap-1 self-center sm:self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada localmente, sem otimização de imagem remota. */}
            <img src={qrCode} alt={`QR Code do formulário ${formulario.nome}`} width={112} height={112} className="rounded-md border border-zinc-200 bg-white" />
            <p className="max-w-[112px] text-center text-[11px] leading-tight text-zinc-500">
              <span className="block font-semibold text-zinc-700">Escaneie o QR Code</span>e acesse o formulário
            </p>
          </div>
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center self-center rounded-md border border-dashed border-zinc-300 px-2 text-center text-xs text-zinc-400 sm:self-start">
            QR Code indisponível
          </div>
        )}
        <div className="flex flex-1 flex-col justify-center gap-2">
          <p className="flex items-center gap-1 text-xs font-medium text-zinc-500">
            <Link2 size={13} /> Link público do formulário
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
            />
            <button
              type="button"
              onClick={copiarLink}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-carvao hover:border-dourado"
            >
              Copiar link
            </button>
          </div>
          <p className={`flex items-center gap-1 text-xs ${formulario.ativo ? "text-green-700" : "text-zinc-500"}`}>
            {formulario.ativo ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {formulario.ativo ? "Formulário ativo e disponível para captação." : "Este captador está desativado."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-lg bg-carvao px-3 py-2.5 text-offwhite hover:bg-zinc-800"
        >
          <ExternalLink size={16} />
          <span className="text-xs font-semibold">Abrir página</span>
          <span className="text-[11px] text-offwhite/60">Acesse o formulário em uma nova aba</span>
        </a>
        <button
          type="button"
          onClick={() => {
            onVisualizar();
            setModalCelular(true);
          }}
          className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
            selecionado ? "border-dourado bg-dourado/10" : "border-zinc-200 hover:border-dourado"
          }`}
        >
          <Smartphone size={16} className="text-carvao" />
          <span className="text-xs font-semibold text-carvao">Visualizar no celular</span>
          <span className="text-[11px] text-zinc-500">Mostre a tela cheia como um cartão de visita</span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={compartilhar}
            className="flex w-full flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-left hover:border-dourado"
          >
            <Share2 size={16} className="text-carvao" />
            <span className="text-xs font-semibold text-carvao">Compartilhar</span>
            <span className="text-[11px] text-zinc-500">Envie o link ou QR Code para sua equipe</span>
          </button>
          {menuCompartilhar && (
            <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  copiarLink();
                  setMenuCompartilhar(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-carvao hover:bg-zinc-50"
              >
                <Link2 size={14} /> Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Confira nosso formulário: ${formulario.nome}\n${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuCompartilhar(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-carvao hover:bg-zinc-50"
              >
                <MessageCircle size={14} /> Compartilhar pelo WhatsApp
              </a>
              {qrCode && (
                <a
                  href={qrCode}
                  download={`raion-qr-${slug(formulario.nome)}.png`}
                  onClick={() => setMenuCompartilhar(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-carvao hover:bg-zinc-50"
                >
                  <ImageIcon size={14} /> Baixar imagem do QR Code
                </a>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModalPoster(true)}
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-left hover:border-dourado"
        >
          <Download size={16} className="text-carvao" />
          <span className="text-xs font-semibold text-carvao">Baixar PDF</span>
          <span className="text-[11px] text-zinc-500">Exporte o QR Code para impressão</span>
        </button>
      </div>
      {aviso && <p className="text-xs text-green-700">{aviso}</p>}
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}

      {modalPoster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-carvao/70 p-4"
          onClick={() => setModalPoster(false)}
        >
          <div
            className="flex max-h-full w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900">Pôster para captação</p>
              <button type="button" onClick={() => setModalPoster(false)} aria-label="Fechar" className="text-zinc-400 hover:text-carvao">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Pronto pra mostrar na tela do celular ou baixar em PDF pra imprimir e expor em feiras e balcões.
            </p>
            <div className="overflow-auto rounded-lg bg-zinc-100 p-4">
              <PosterFormulario qrCode={qrCode} />
            </div>
            <a
              href={`/configuracoes/captura/${formulario.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-carvao px-4 py-2.5 text-sm font-medium text-offwhite hover:bg-zinc-800"
            >
              <Download size={16} /> Baixar PDF
            </a>
          </div>
        </div>
      )}

      {modalCelular && (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-carvao p-4"
          onClick={() => setModalCelular(false)}
        >
          <PosterFormulario qrCode={qrCode} className="h-full max-h-full w-auto max-w-full" />
        </div>
      )}

      {modalExcluir && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-carvao/70 p-4"
          onClick={() => setModalExcluir(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Excluir formulário?</p>
                <p className="mt-1 text-xs text-zinc-500">
                  O formulário &ldquo;{formulario.nome}&rdquo; e seu QR Code serão apagados permanentemente. Os leads
                  já capturados não são afetados. Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>
            {resultadoExcluir && !resultadoExcluir.ok && <Mensagem resultado={resultadoExcluir} />}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalExcluir(false)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-carvao hover:border-zinc-300"
              >
                Cancelar
              </button>
              <form action={acaoExcluir}>
                <input type="hidden" name="id" value={formulario.id} />
                <button
                  type="submit"
                  disabled={excluindo}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 size={14} /> {excluindo ? "Excluindo…" : "Excluir"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
