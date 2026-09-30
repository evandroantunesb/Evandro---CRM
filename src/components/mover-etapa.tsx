"use client";

import { ChevronDown, MoreVertical, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { alternarEtiqueta, moverEtapa } from "@/lib/acoes/negocios";
import { ItemMenuSuspenso, MenuSuspenso, RotuloMenuSuspenso } from "@/components/menu-suspenso";

type EtiquetaDisponivel = { id: string; nome: string; cor: string | null };

/**
 * Menu "Mover para": alternativa ao arrastar no Kanban, essencial no celular
 * (onde arrastar cards é difícil) e útil na página do negócio pra trocar de etapa sem editar o card inteiro.
 * No card do Kanban (compacto) também abre o negócio e, se houver etiquetas cadastradas, edita as etiquetas do negócio.
 */
export function MoverEtapa({
  negocioId,
  etapaAtualId,
  etapas,
  compacto = false,
  etiquetas = [],
  etiquetasMarcadas = [],
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: { id: string; nome: string }[];
  compacto?: boolean;
  etiquetas?: EtiquetaDisponivel[];
  etiquetasMarcadas?: string[];
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [editandoEtiquetas, setEditandoEtiquetas] = useState(false);
  const destinos = etapas.filter((e) => e.id !== etapaAtualId);

  function mover(etapaId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(negocioId, etapaId);
      if (!r?.ok) setErro(r?.mensagem ?? "Não foi possível mover.");
    });
  }

  if (!destinos.length && !compacto) return null;

  return (
    <div className="inline-flex flex-col">
      <MenuSuspenso
        trigger={({ alternar }) =>
          compacto ? (
            <button
              type="button"
              aria-label="Opções do negócio"
              disabled={pendente}
              onClick={alternar}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            >
              <MoreVertical size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={pendente}
              onClick={alternar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-carvao transition-colors hover:border-dourado disabled:opacity-50"
            >
              {pendente ? "Movendo..." : "Mover para"}
              <ChevronDown size={14} />
            </button>
          )
        }
      >
        {compacto && (
          <>
            <Link href={`/negocios/${negocioId}`} className="block px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              Abrir negócio
            </Link>
            {etiquetas.length > 0 && (
              <ItemMenuSuspenso onClick={() => setEditandoEtiquetas(true)}>Editar etiquetas</ItemMenuSuspenso>
            )}
            {destinos.length > 0 && <div className="my-1 border-t border-zinc-100" />}
          </>
        )}
        {destinos.length > 0 && (
          <>
            {compacto && <RotuloMenuSuspenso>Mover para</RotuloMenuSuspenso>}
            {destinos.map((e) => (
              <ItemMenuSuspenso key={e.id} onClick={() => mover(e.id)} disabled={pendente}>
                {e.nome}
              </ItemMenuSuspenso>
            ))}
          </>
        )}
      </MenuSuspenso>
      {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
      {editandoEtiquetas && (
        <ModalEtiquetas
          negocioId={negocioId}
          etiquetas={etiquetas}
          marcadas={etiquetasMarcadas}
          aoFechar={() => setEditandoEtiquetas(false)}
        />
      )}
    </div>
  );
}

/** Modal simples pra marcar/desmarcar as etiquetas de um negócio direto do Kanban. */
function ModalEtiquetas({
  negocioId,
  etiquetas,
  marcadas,
  aoFechar,
}: {
  negocioId: string;
  etiquetas: EtiquetaDisponivel[];
  marcadas: string[];
  aoFechar: () => void;
}) {
  const [marcadasAtual, setMarcadasAtual] = useState(new Set(marcadas));
  const [, iniciar] = useTransition();

  function alternar(etiquetaId: string) {
    const marcar = !marcadasAtual.has(etiquetaId);
    setMarcadasAtual((s) => {
      const novo = new Set(s);
      if (marcar) novo.add(etiquetaId);
      else novo.delete(etiquetaId);
      return novo;
    });
    iniciar(async () => {
      const fd = new FormData();
      fd.set("negocioId", negocioId);
      fd.set("etiquetaId", etiquetaId);
      fd.set("marcar", String(marcar));
      await alternarEtiqueta(fd);
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
      onClick={aoFechar}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-titulo text-sm font-semibold text-carvao">Etiquetas do negócio</h3>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {etiquetas.map((e) => {
            const marcada = marcadasAtual.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => alternar(e.id)}
                aria-pressed={marcada}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${marcada ? "text-white" : "bg-white text-zinc-700"}`}
                style={
                  marcada
                    ? { background: e.cor ?? "#71717a", borderColor: e.cor ?? "#71717a" }
                    : { borderColor: e.cor ?? "#d4d4d8" }
                }
              >
                {marcada ? "✓ " : ""}
                {e.nome}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
