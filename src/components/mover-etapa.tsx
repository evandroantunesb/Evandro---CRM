"use client";

import { Check, ChevronDown, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { alternarEtiqueta } from "@/lib/acoes/negocios";
import { Janela } from "@/components/janela";
import { CLASSE_ITEM_MENU, ItemMenuSuspenso, MenuSuspenso, RotuloMenuSuspenso, SeparadorMenuSuspenso } from "@/components/menu-suspenso";
import { ModalComentarioEtapa } from "@/components/comentario-etapa";

type EtiquetaDisponivel = { id: string; nome: string; cor: string | null };
type MotivoDisponivel = { id: string; nome: string };

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
  motivos = [],
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: { id: string; nome: string; fechaComo?: "ganho" | "perdido" | null }[];
  compacto?: boolean;
  etiquetas?: EtiquetaDisponivel[];
  etiquetasMarcadas?: string[];
  motivos?: MotivoDisponivel[];
}) {
  const [editandoEtiquetas, setEditandoEtiquetas] = useState(false);
  const [destinoPendente, setDestinoPendente] = useState<{ id: string; nome: string; fechaComo?: "ganho" | "perdido" | null } | null>(
    null,
  );
  const destinos = etapas.filter((e) => e.id !== etapaAtualId);

  if (!destinos.length && !compacto) return null;

  return (
    <div className="inline-flex flex-col">
      <MenuSuspenso
        trigger={({ alternar }) =>
          compacto ? (
            <button
              type="button"
              aria-label="Opções do negócio"
              aria-haspopup="menu"
              onClick={alternar}
              className="grid h-9 w-9 place-items-center rounded-full text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto disabled:opacity-50 md:h-7 md:w-7"
            >
              <MoreVertical size={16} />
            </button>
          ) : (
            <button
              type="button"
              aria-haspopup="menu"
              onClick={alternar}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-sm font-medium text-texto transition-colors hover:border-dourado disabled:opacity-50 md:min-h-9"
            >
              Mover para
              <ChevronDown size={14} />
            </button>
          )
        }
      >
        {compacto && (
          <>
            <Link href={`/negocios/${negocioId}`} role="menuitem" className={`${CLASSE_ITEM_MENU} font-medium`}>
              Abrir negócio
            </Link>
            {etiquetas.length > 0 && (
              <ItemMenuSuspenso onClick={() => setEditandoEtiquetas(true)}>Editar etiquetas</ItemMenuSuspenso>
            )}
            {destinos.length > 0 && <SeparadorMenuSuspenso />}
          </>
        )}
        {destinos.length > 0 && (
          <>
            {compacto && <RotuloMenuSuspenso>Mover para</RotuloMenuSuspenso>}
            {destinos.map((e) => (
              <ItemMenuSuspenso key={e.id} onClick={() => setDestinoPendente({ id: e.id, nome: e.nome, fechaComo: e.fechaComo })}>
                {e.nome}
              </ItemMenuSuspenso>
            ))}
          </>
        )}
      </MenuSuspenso>
      {editandoEtiquetas && (
        <ModalEtiquetas
          negocioId={negocioId}
          etiquetas={etiquetas}
          marcadas={etiquetasMarcadas}
          aoFechar={() => setEditandoEtiquetas(false)}
        />
      )}
      {destinoPendente && (
        <ModalComentarioEtapa
          negocioId={negocioId}
          etapaId={destinoPendente.id}
          etapaNome={destinoPendente.nome}
          precisaMotivoPerda={destinoPendente.fechaComo === "perdido"}
          motivos={motivos}
          aoConcluir={() => setDestinoPendente(null)}
          aoCancelar={() => setDestinoPendente(null)}
        />
      )}
    </div>
  );
}

/** Janela para marcar/desmarcar as etiquetas de um negócio direto do Kanban. */
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
    <Janela aberta aoFechar={aoFechar} titulo="Etiquetas do negócio">
      <p className="-mt-2 text-sm text-texto-2">Toque para marcar ou desmarcar. Salva na hora.</p>
      <div className="flex flex-wrap gap-2">
        {etiquetas.map((e) => {
          const marcada = marcadasAtual.has(e.id);
          const cor = e.cor ?? "#8a8a92";
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => alternar(e.id)}
              aria-pressed={marcada}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-linha px-4 text-sm text-texto transition-[background-color,border-color] duration-200 ease-raion md:min-h-9"
              style={marcada ? { borderColor: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` } : undefined}
            >
              {marcada ? <Check size={14} style={{ color: cor }} aria-hidden /> : <span className="h-2 w-2 rounded-full" style={{ background: cor }} />}
              {e.nome}
            </button>
          );
        })}
      </div>
    </Janela>
  );
}
