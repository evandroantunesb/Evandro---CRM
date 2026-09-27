"use client";

import { CheckCircle2, Download, ExternalLink, Link2, Share2, Smartphone, Users, XCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { Mensagem } from "@/components/ui";
import { alternarFormulario } from "./actions";

type Formulario = { id: string; nome: string; funil: string; origem: string; ativo: boolean };

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
  const [aviso, setAviso] = useState<string | null>(null);

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 2500);
  }

  async function compartilhar() {
    const dados = { title: `Formulário ${formulario.nome}`, text: "Preencha seus dados, é rápido:", url: link };
    if (navigator.share) {
      try {
        await navigator.share(dados);
      } catch {
        // Usuário cancelou o compartilhamento — não é um erro.
      }
      return;
    }
    await navigator.clipboard.writeText(link);
    avisar("Link copiado! Cole onde quiser compartilhar.");
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-white p-5 transition-colors ${
        selecionado ? "border-dourado shadow-[0_0_0_1px_rgba(212,175,55,0.4)]" : "border-zinc-200/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-carvao text-offwhite">
            <Users size={18} />
          </span>
          <div>
            <p className="font-medium text-zinc-900">{formulario.nome}</p>
            <p className="text-xs text-zinc-500">
              {formulario.funil} · {formulario.origem}
            </p>
          </div>
        </div>
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
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 sm:flex-row">
        {qrCode ? (
          <div className="flex shrink-0 flex-col items-center gap-1 self-center sm:self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada localmente, sem otimização de imagem remota. */}
            <img src={qrCode} alt={`QR Code do formulário ${formulario.nome}`} width={112} height={112} className="rounded-md border border-zinc-200 bg-white" />
            <p className="max-w-[112px] text-center text-[11px] leading-tight text-zinc-500">Escaneie o QR Code e acesse o formulário</p>
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
              onClick={() => {
                navigator.clipboard.writeText(link);
                avisar("Link copiado!");
              }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-carvao hover:border-dourado"
            >
              Copiar link
            </button>
          </div>
          <p className={`flex items-center gap-1 text-xs ${formulario.ativo ? "text-green-700" : "text-zinc-500"}`}>
            {formulario.ativo ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {formulario.ativo ? "Página no ar e recebendo envios de leads." : "Formulário desativado — não está recebendo envios."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-1 rounded-lg bg-carvao px-3 py-2.5 text-offwhite hover:bg-zinc-800"
        >
          <ExternalLink size={16} />
          <span className="text-xs font-semibold">Abrir página</span>
          <span className="text-[11px] text-offwhite/60">Acesse o formulário em uma nova aba</span>
        </a>
        <button
          type="button"
          onClick={onVisualizar}
          className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
            selecionado ? "border-dourado bg-dourado/10" : "border-zinc-200 hover:border-dourado"
          }`}
        >
          <Smartphone size={16} className="text-carvao" />
          <span className="text-xs font-semibold text-carvao">Visualizar no celular</span>
          <span className="text-[11px] text-zinc-500">Veja como o formulário fica no smartphone</span>
        </button>
        <button
          type="button"
          onClick={compartilhar}
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-left hover:border-dourado"
        >
          <Share2 size={16} className="text-carvao" />
          <span className="text-xs font-semibold text-carvao">Compartilhar</span>
          <span className="text-[11px] text-zinc-500">Envie o link ou QR Code para sua equipe</span>
        </button>
        <a
          href={`/configuracoes/captura/${formulario.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-left hover:border-dourado"
        >
          <Download size={16} className="text-carvao" />
          <span className="text-xs font-semibold text-carvao">Baixar PDF</span>
          <span className="text-[11px] text-zinc-500">Exporte o QR Code para impressão</span>
        </a>
      </div>
      {aviso && <p className="text-xs text-green-700">{aviso}</p>}
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </div>
  );
}
