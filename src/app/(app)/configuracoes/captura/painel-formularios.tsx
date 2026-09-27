"use client";

import { Lightbulb, Megaphone, Monitor, QrCode, Share2, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { CardFormulario } from "./card-formulario";

type Item = {
  formulario: { id: string; nome: string; funil: string; origem: string; ativo: boolean };
  link: string;
  qrCode: string | null;
};

export function PainelFormularios({ itens }: { itens: Item[] }) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(itens[0]?.formulario.id ?? null);
  const [modo, setModo] = useState<"celular" | "desktop">("celular");
  const previewRef = useRef<HTMLDivElement>(null);
  const selecionado = itens.find((i) => i.formulario.id === selecionadoId) ?? itens[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {itens.length === 0 && <p className="text-sm text-zinc-500">Nenhum formulário criado ainda.</p>}
          {itens.map(({ formulario, link, qrCode }) => (
            <CardFormulario
              key={formulario.id}
              formulario={formulario}
              link={link}
              qrCode={qrCode}
              selecionado={formulario.id === selecionadoId}
              onVisualizar={() => {
                setSelecionadoId(formulario.id);
                previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
            />
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

      <div ref={previewRef} className="rounded-xl border border-zinc-200/80 bg-white p-4 lg:sticky lg:top-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Pré-visualização da página</p>
            <p className="text-xs text-zinc-500">Assim seus leads vão ver o formulário.</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg border border-zinc-200 p-0.5">
            <button
              type="button"
              onClick={() => setModo("celular")}
              aria-label="Ver como celular"
              className={`rounded-md p-1.5 ${modo === "celular" ? "bg-carvao text-offwhite" : "text-zinc-500 hover:text-carvao"}`}
            >
              <Smartphone size={14} />
            </button>
            <button
              type="button"
              onClick={() => setModo("desktop")}
              aria-label="Ver como computador"
              className={`rounded-md p-1.5 ${modo === "desktop" ? "bg-carvao text-offwhite" : "text-zinc-500 hover:text-carvao"}`}
            >
              <Monitor size={14} />
            </button>
          </div>
        </div>

        {!selecionado ? (
          <p className="py-10 text-center text-sm text-zinc-400">Crie um formulário para pré-visualizar aqui.</p>
        ) : (
          <div className={modo === "celular" ? "mx-auto w-[220px] overflow-hidden rounded-[1.75rem] border-[6px] border-carvao bg-carvao" : "overflow-hidden rounded-lg border border-zinc-300"}>
            {modo === "celular" ? (
              <div className="mx-auto mb-1 h-4 w-20 rounded-b-lg bg-carvao" />
            ) : (
              <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
                <span className="h-2 w-2 rounded-full bg-zinc-300" />
                <span className="h-2 w-2 rounded-full bg-zinc-300" />
                <span className="h-2 w-2 rounded-full bg-zinc-300" />
              </div>
            )}
            <div className="relative">
              <iframe
                key={selecionado.formulario.id}
                src={selecionado.link}
                title={`Pré-visualização de ${selecionado.formulario.nome}`}
                tabIndex={-1}
                className={`pointer-events-none w-full bg-white select-none ${modo === "celular" ? "h-[440px] rounded-b-xl" : "h-[440px]"}`}
              />
              <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-carvao/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-offwhite uppercase">
                Modo de pré-visualização
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
