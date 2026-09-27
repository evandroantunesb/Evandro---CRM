"use client";

import { Monitor, Smartphone } from "lucide-react";
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
        ) : modo === "celular" ? (
          <div className="mx-auto w-[220px] overflow-hidden rounded-[1.75rem] border-[6px] border-carvao bg-carvao">
            <div className="mx-auto mb-1 h-4 w-20 rounded-b-lg bg-carvao" />
            <iframe
              key={selecionado.formulario.id}
              src={selecionado.link}
              title={`Pré-visualização de ${selecionado.formulario.nome}`}
              className="h-[440px] w-full rounded-b-xl bg-white"
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-300">
            <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-300" />
              <span className="h-2 w-2 rounded-full bg-zinc-300" />
              <span className="h-2 w-2 rounded-full bg-zinc-300" />
            </div>
            <iframe
              key={selecionado.formulario.id}
              src={selecionado.link}
              title={`Pré-visualização de ${selecionado.formulario.nome}`}
              className="h-[440px] w-full bg-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}
