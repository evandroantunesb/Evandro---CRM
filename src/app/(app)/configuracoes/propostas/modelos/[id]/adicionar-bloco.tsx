"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState } from "react";
import { Cartao, Mensagem } from "@/components/ui";
import { adicionarBlocoModelo } from "@/lib/acoes/proposta-modelos";
import { BLOCOS_PROPOSTA, NOME_CATEGORIA_BLOCO, type CategoriaBloco } from "@/lib/propostas/blocos";

function BotaoAdicionar({ modeloId, tipo }: { modeloId: string; tipo: string }) {
  const [resultado, acao, adicionando] = useActionState(adicionarBlocoModelo, null);
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={acao}>
        <input type="hidden" name="modeloId" value={modeloId} />
        <input type="hidden" name="tipo" value={tipo} />
        <button
          type="submit"
          disabled={adicionando}
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-carvao hover:border-dourado disabled:opacity-50"
        >
          {adicionando ? "..." : "Adicionar"}
        </button>
      </form>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </div>
  );
}

export function AdicionarBloco({ modeloId, tiposUsados }: { modeloId: string; tiposUsados: string[] }) {
  const [aberto, setAberto] = useState(false);
  const disponiveis = BLOCOS_PROPOSTA.filter((b) => !tiposUsados.includes(b.tipo));
  const categorias = Array.from(new Set(disponiveis.map((b) => b.categoria))) as CategoriaBloco[];

  return (
    <Cartao
      titulo="Adicionar bloco"
      acao={
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 text-sm font-medium text-carvao hover:text-dourado"
        >
          {aberto ? "Fechar" : "Escolher bloco"}
          <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      }
    >
      {!aberto && <p className="text-sm text-zinc-500">Clique em &quot;Escolher bloco&quot; para adicionar mais conteúdo ao modelo.</p>}
      {aberto && disponiveis.length === 0 && <p className="text-sm text-zinc-500">Todos os blocos do catálogo já estão neste modelo.</p>}
      {aberto &&
        categorias.map((cat) => (
          <div key={cat} className="mb-3 last:mb-0">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{NOME_CATEGORIA_BLOCO[cat]}</h3>
            <div className="flex flex-col gap-1.5">
              {disponiveis
                .filter((b) => b.categoria === cat)
                .map((b) => (
                  <div key={b.tipo} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">
                        {b.nome}
                        {!b.implementado && <span className="ml-1.5 text-xs font-normal text-amber-700">(em breve no PDF)</span>}
                      </p>
                      <p className="text-xs text-zinc-500">{b.descricao}</p>
                    </div>
                    <BotaoAdicionar modeloId={modeloId} tipo={b.tipo} />
                  </div>
                ))}
            </div>
          </div>
        ))}
    </Cartao>
  );
}
