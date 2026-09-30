"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { ModalComentarioEtapa } from "@/components/comentario-etapa";
import { MoverEtapa } from "@/components/mover-etapa";
import { formatarMoeda, formatarPrazo } from "@/lib/formatacao";

export type Card = {
  id: string;
  numero: number;
  titulo: string;
  contato: string;
  responsavel: string;
  origem: string | null;
  valor: string;
  valorNumerico: number | null;
  etapaId: string;
  desde: string;
  atualizadoEm: string;
  /** Próxima tarefa em aberto do negócio. */
  tarefa: "atrasada" | "hoje" | "futura" | "nenhuma";
  tarefaTitulo: string | null;
  tarefaVenceEm: string | null;
  etiquetas: { id: string; nome: string; cor: string | null }[];
  /** Quantidade de notas/comentários do negócio. */
  comentarios: number;
};

type Coluna = { id: string; nome: string; cor: string | null; inicial: boolean; fechaComo?: "ganho" | "perdido" | null };
export type EtiquetaDisponivel = { id: string; nome: string; cor: string | null };
type MotivoDisponivel = { id: string; nome: string };

export function Kanban({
  colunas,
  cards: iniciais,
  funilId,
  etiquetas,
  motivos = [],
}: {
  colunas: Coluna[];
  cards: Card[];
  funilId: string;
  etiquetas: EtiquetaDisponivel[];
  motivos?: MotivoDisponivel[];
}) {
  const [cards, setCards] = useState(iniciais);
  const [movimentoPendente, setMovimentoPendente] = useState<
    { cardId: string; etapaId: string; etapaNome: string; fechaComo?: "ganho" | "perdido" | null } | null
  >(null);
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function aoSoltar(evento: DragEndEvent) {
    const cardId = String(evento.active.id);
    const destino = evento.over ? String(evento.over.id) : null;
    const card = cards.find((c) => c.id === cardId);
    const coluna = colunas.find((c) => c.id === destino);
    if (!card || !destino || !coluna || card.etapaId === destino) return;
    setMovimentoPendente({ cardId, etapaId: destino, etapaNome: coluna.nome, fechaComo: coluna.fechaComo });
  }

  function aoConcluirMovimento() {
    if (!movimentoPendente) return;
    const { cardId, etapaId } = movimentoPendente;
    setCards((cs) =>
      cs.map((c) =>
        c.id === cardId ? { ...c, etapaId, desde: "agora", comentarios: c.comentarios + 1 } : c,
      ),
    );
    setMovimentoPendente(null);
  }

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map((col) => (
          <ColunaKanban
            key={col.id}
            coluna={col}
            colunas={colunas}
            funilId={funilId}
            cards={cards.filter((c) => c.etapaId === col.id)}
            etiquetas={etiquetas}
            motivos={motivos}
          />
        ))}
      </div>
      {movimentoPendente && (
        <ModalComentarioEtapa
          negocioId={movimentoPendente.cardId}
          etapaId={movimentoPendente.etapaId}
          etapaNome={movimentoPendente.etapaNome}
          precisaMotivoPerda={movimentoPendente.fechaComo === "perdido"}
          motivos={motivos}
          aoConcluir={aoConcluirMovimento}
          aoCancelar={() => setMovimentoPendente(null)}
        />
      )}
    </DndContext>
  );
}

function ColunaKanban({
  coluna,
  colunas,
  cards,
  funilId,
  etiquetas,
  motivos,
}: {
  coluna: Coluna;
  colunas: Coluna[];
  cards: Card[];
  funilId: string;
  etiquetas: EtiquetaDisponivel[];
  motivos: MotivoDisponivel[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  const soma = cards.reduce((total, c) => total + (c.valorNumerico ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl p-2 transition-colors ${
        isOver ? "bg-amber-50 ring-2 ring-dourado" : "bg-zinc-100"
      }`}
    >
      <header className="px-1.5 pt-1.5 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-titulo truncate text-sm font-semibold text-carvao" title={coluna.nome}>
            {coluna.nome}
          </h2>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 shadow-sm">
            {cards.length}
          </span>
        </div>
        {soma > 0 && <p className="mt-0.5 text-xs text-zinc-500">{formatarMoeda(soma)}</p>}
        <div className="mt-2 h-[3px] rounded-full" style={{ background: coluna.cor ?? "#d4d4d8" }} />
      </header>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <CardKanban key={c.id} card={c} colunas={colunas} corEtapa={coluna.cor} etiquetas={etiquetas} motivos={motivos} />
        ))}
        {!cards.length && <p className="px-1 py-4 text-center text-xs text-zinc-400">Arraste um negócio para cá</p>}
        {coluna.inicial && (
          <Link
            href={`/negocios/novo?funil=${funilId}&etapa=${coluna.id}`}
            className="mt-1 flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-dourado hover:text-carvao"
          >
            <Plus size={13} /> Adicionar negócio
          </Link>
        )}
      </div>
    </section>
  );
}

/** Prazo da próxima tarefa (com alerta se atrasada) ou, na falta dela, "há X tempo" desde que entrou na etapa. */
function PrazoOuDesde({ card }: { card: Card }) {
  if (card.tarefa !== "nenhuma" && card.tarefaVenceEm) {
    const atrasada = card.tarefa === "atrasada";
    return (
      <span
        title={card.tarefaTitulo ?? undefined}
        className={`ml-auto flex items-center gap-1 ${atrasada ? "font-medium text-red-700" : ""}`}
      >
        <CalendarClock size={12} />
        {formatarPrazo(card.tarefaVenceEm)}
      </span>
    );
  }
  return <span className="ml-auto">{card.desde}</span>;
}

function CardKanban({
  card,
  colunas,
  corEtapa,
  etiquetas,
  motivos,
}: {
  card: Card;
  colunas: Coluna[];
  corEtapa: string | null;
  etiquetas: EtiquetaDisponivel[];
  motivos: MotivoDisponivel[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={{ ...estilo, borderLeftColor: corEtapa ?? "#d4d4d8" }}
      {...listeners}
      {...attributes}
      className={`relative touch-manipulation rounded-md border border-l-4 border-zinc-200 bg-white p-3 text-sm shadow-sm transition-shadow ${
        isDragging ? "z-10 cursor-grabbing opacity-80 shadow-lg" : "cursor-grab hover:shadow-md"
      }`}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <Avatar nome={card.responsavel} tamanho={22} />
        <MoverEtapa
          negocioId={card.id}
          etapaAtualId={card.etapaId}
          etapas={colunas}
          compacto
          etiquetas={etiquetas}
          etiquetasMarcadas={card.etiquetas.map((e) => e.id)}
          motivos={motivos}
        />
      </div>
      <Link href={`/negocios/${card.id}`} className="-m-1 block rounded-md p-1 pr-16 hover:bg-zinc-50">
        <p className="truncate font-medium text-carvao">{card.contato}</p>
        <p className="truncate text-zinc-600">
          #{card.numero} · {card.titulo}
        </p>
      </Link>
      {(card.origem || card.etiquetas.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
          {card.origem && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-zinc-600">{card.origem}</span>}
          {card.etiquetas.map((e) => (
            <span
              key={e.id}
              className="rounded-full px-1.5 py-0.5 text-white"
              style={{ background: e.cor ?? "#71717a" }}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-x-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
        {card.valor && <span className="font-semibold text-carvao">{card.valor}</span>}
        {card.comentarios > 0 && (
          <span className="flex items-center gap-0.5" title={`${card.comentarios} comentário(s)`}>
            <MessageCircle size={12} />
            {card.comentarios}
          </span>
        )}
        <PrazoOuDesde card={card} />
      </div>
    </article>
  );
}
