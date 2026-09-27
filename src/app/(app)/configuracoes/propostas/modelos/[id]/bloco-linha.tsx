"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Mensagem, Selecao, Selo } from "@/components/ui";
import { alternarBlocoModelo, definirQuebraBlocoModelo, moverBlocoModelo, removerBlocoModelo } from "@/lib/acoes/proposta-modelos";
import { definicaoDoBloco, NOME_CATEGORIA_BLOCO } from "@/lib/propostas/blocos";

type Bloco = { id: string; tipo: string; ativo: boolean; quebraPagina: "auto" | "nova_pagina" | "pagina_exclusiva" };

export function BlocoLinha({ modeloId, bloco, posicao, total }: { modeloId: string; bloco: Bloco; posicao: number; total: number }) {
  const def = definicaoDoBloco(bloco.tipo);
  const [resAtivo, acaoAtivo] = useActionState(alternarBlocoModelo, null);
  const [resMover, acaoMover, movendo] = useActionState(moverBlocoModelo, null);
  const [resQuebra, acaoQuebra] = useActionState(definirQuebraBlocoModelo, null);
  const [resRemover, acaoRemover] = useActionState(removerBlocoModelo, null);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <div className="flex flex-col pt-0.5">
            <form action={acaoMover}>
              <input type="hidden" name="modeloId" value={modeloId} />
              <input type="hidden" name="id" value={bloco.id} />
              <input type="hidden" name="direcao" value="cima" />
              <button
                type="submit"
                disabled={movendo || posicao === 0}
                className="block text-zinc-400 hover:text-carvao disabled:opacity-30"
                aria-label="Mover para cima"
              >
                <ChevronUp size={16} />
              </button>
            </form>
            <form action={acaoMover}>
              <input type="hidden" name="modeloId" value={modeloId} />
              <input type="hidden" name="id" value={bloco.id} />
              <input type="hidden" name="direcao" value="baixo" />
              <button
                type="submit"
                disabled={movendo || posicao === total - 1}
                className="block text-zinc-400 hover:text-carvao disabled:opacity-30"
                aria-label="Mover para baixo"
              >
                <ChevronDown size={16} />
              </button>
            </form>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-zinc-900">{def?.nome ?? bloco.tipo}</span>
              {def && !def.implementado && <Selo tom="atencao">Em breve no PDF</Selo>}
              {def?.obrigatorioNoComercial && <Selo tom="neutro">Obrigatório p/ publicar</Selo>}
            </div>
            <p className="text-xs text-zinc-500">
              {def ? NOME_CATEGORIA_BLOCO[def.categoria] : ""}
              {def?.descricao ? ` · ${def.descricao}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={acaoQuebra}>
            <input type="hidden" name="modeloId" value={modeloId} />
            <input type="hidden" name="id" value={bloco.id} />
            <Selecao name="quebra_pagina" defaultValue={bloco.quebraPagina} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              <option value="auto">Quebra automática</option>
              <option value="nova_pagina">Sempre nova página</option>
              <option value="pagina_exclusiva">Página exclusiva</option>
            </Selecao>
          </form>
          <form action={acaoAtivo}>
            <input type="hidden" name="modeloId" value={modeloId} />
            <input type="hidden" name="id" value={bloco.id} />
            <input type="hidden" name="ativo" value={bloco.ativo ? "0" : "1"} />
            <button
              type="submit"
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                bloco.ativo ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "border-dourado/40 bg-dourado/10 text-dourado"
              }`}
            >
              {bloco.ativo ? "Ativo" : "Desativado"}
            </button>
          </form>
          <form
            action={acaoRemover}
            onSubmit={(e) => {
              if (!confirm("Remover este bloco do modelo?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="modeloId" value={modeloId} />
            <input type="hidden" name="id" value={bloco.id} />
            <button type="submit" className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-700" aria-label="Remover bloco">
              <Trash2 size={16} />
            </button>
          </form>
        </div>
      </div>
      <Mensagem resultado={resAtivo ?? resMover ?? resQuebra ?? resRemover} />
    </div>
  );
}
