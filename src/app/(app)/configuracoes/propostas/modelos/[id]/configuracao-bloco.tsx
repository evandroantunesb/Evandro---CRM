"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarConfigBlocoModelo } from "@/lib/acoes/proposta-modelos";

function itensDoConfig(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const itens = (config as { itens?: unknown }).itens;
  return Array.isArray(itens) ? itens.filter((i): i is string => typeof i === "string") : [];
}

function camposDoConfig(config: unknown): { texto: string; ctaTexto: string } {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  return { texto: typeof cfg.texto === "string" ? cfg.texto : "", ctaTexto: typeof cfg.ctaTexto === "string" ? cfg.ctaTexto : "" };
}

function ItensInclusosConfig({ modeloId, blocoId, config }: { modeloId: string; blocoId: string; config: unknown }) {
  const [resultado, acao, salvando] = useActionState(salvarConfigBlocoModelo, null);
  const [itensTexto, setItensTexto] = useState(itensDoConfig(config).join("\n"));
  const configJson = JSON.stringify({ itens: itensTexto.split("\n").map((l) => l.trim()).filter(Boolean) });

  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <input type="hidden" name="id" value={blocoId} />
      <input type="hidden" name="config" value={configJson} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">Itens inclusos (um por linha; deixe vazio pra usar a lista padrão)</span>
        <textarea
          value={itensTexto}
          onChange={(e) => setItensTexto(e.target.value)}
          rows={3}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-carvao outline-none focus:border-dourado"
        />
      </label>
      <Botao type="submit" variante="secundario" disabled={salvando} className="self-start px-3 py-1 text-xs">
        {salvando ? "Salvando..." : "Salvar conteúdo"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function ProximosPassosConfig({ modeloId, blocoId, config }: { modeloId: string; blocoId: string; config: unknown }) {
  const [resultado, acao, salvando] = useActionState(salvarConfigBlocoModelo, null);
  const iniciais = camposDoConfig(config);
  const [texto, setTexto] = useState(iniciais.texto);
  const [ctaTexto, setCtaTexto] = useState(iniciais.ctaTexto);
  const configJson = JSON.stringify({ texto, ctaTexto });

  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <input type="hidden" name="id" value={blocoId} />
      <input type="hidden" name="config" value={configJson} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">Texto de fechamento (vazio usa o padrão)</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-carvao outline-none focus:border-dourado"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">Chamada para ação (vazio usa o WhatsApp da identidade)</span>
        <input
          value={ctaTexto}
          onChange={(e) => setCtaTexto(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-carvao outline-none focus:border-dourado"
        />
      </label>
      <Botao type="submit" variante="secundario" disabled={salvando} className="self-start px-3 py-1 text-xs">
        {salvando ? "Salvando..." : "Salvar conteúdo"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

/** Editor de conteúdo do bloco, só pros tipos que de fato lêem `config` no PDF. */
export function ConfiguracaoBloco({ modeloId, blocoId, tipo, config }: { modeloId: string; blocoId: string; tipo: string; config: unknown }) {
  const [aberto, setAberto] = useState(false);
  if (tipo !== "included_services" && tipo !== "next_steps") return null;

  return (
    <div>
      <button type="button" onClick={() => setAberto((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-carvao">
        Personalizar conteúdo
        <ChevronDown size={12} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto &&
        (tipo === "included_services" ? (
          <ItensInclusosConfig modeloId={modeloId} blocoId={blocoId} config={config} />
        ) : (
          <ProximosPassosConfig modeloId={modeloId} blocoId={blocoId} config={config} />
        ))}
    </div>
  );
}
