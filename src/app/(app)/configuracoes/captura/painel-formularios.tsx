"use client";

import { Lightbulb, Megaphone, QrCode, Share2, Smartphone } from "lucide-react";
import { CardFormulario } from "./card-formulario";

type Item = {
  formulario: {
    id: string;
    nome: string;
    funil: string;
    origem: string;
    ativo: boolean;
    visualizacoes: number;
    preenchimentos: number;
  };
  link: string;
  qrCode: string | null;
};

export function PainelFormularios({ itens }: { itens: Item[] }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-3">
        {itens.length === 0 && <p className="text-sm text-zinc-500">Nenhum formulário criado ainda.</p>}
        {itens.map(({ formulario, link, qrCode }) => (
          <CardFormulario key={formulario.id} formulario={formulario} link={link} qrCode={qrCode} />
        ))}
      </div>

      {itens.length > 0 && (
        <>
          <div className="flex gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dourado/15 text-dourado">
              <Megaphone size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">Compartilhe seu formulário</p>
              <p className="text-xs text-zinc-600">
                Use o QR Code em eventos, feiras, apresentações ou materiais impressos. Os leads serão capturados automaticamente no seu CRM.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Lightbulb size={16} className="text-dourado" /> Dicas para usar em eventos
            </p>
            <div className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-zinc-200">
              <div className="flex gap-2 sm:pr-4">
                <QrCode size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">Imprima o QR Code</p>
                  <p className="text-xs text-zinc-500">Use em crachás, displays e materiais de divulgação.</p>
                </div>
              </div>
              <div className="flex gap-2 sm:px-4">
                <Smartphone size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">Mostre no celular</p>
                  <p className="text-xs text-zinc-500">Abra a página e apresente diretamente ao interessado.</p>
                </div>
              </div>
              <div className="flex gap-2 sm:pl-4">
                <Share2 size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">Compartilhe digitalmente</p>
                  <p className="text-xs text-zinc-500">Envie o link por WhatsApp, e-mail ou nas redes sociais.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
