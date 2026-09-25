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
import Link from "next/link";
import { useState, useTransition } from "react";
import { moverEtapa } from "@/lib/acoes/negocios";

export type Card = {
  id: string;
  numero: number;
  titulo: string;
  contato: string;
  responsavel: string;
  origem: string | null;
  valor: string;
  etapaId: string;
  desde: string;
};

type Coluna = { id: string; nome: string };

export function Kanban({ colunas, cards: iniciais }: { colunas: Coluna[]; cards: Card[] }) {
  const [cards, setCards] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function aoSoltar(evento: DragEndEvent) {
    const cardId = String(evento.active.id);
    const destino = evento.over ? String(evento.over.id) : null;
    const card = cards.find((c) => c.id === cardId);
    if (!card || !destino || card.etapaId === destino) return;

    const anterior = card.etapaId;
    setErro(null);
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, etapaId: destino, desde: "agora" } : c)));
    iniciar(async () => {
      const r = await moverEtapa(cardId, destino);
      if (!r?.ok) {
        setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, etapaId: anterior } : c)));
        setErro(r?.mensagem ?? "Não foi possível mover.");
      }
    });
  }

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      {erro && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map((col) => (
          <ColunaKanban key={col.id} coluna={col} cards={cards.filter((c) => c.etapaId === col.id)} />
        ))}
      </div>
    </DndContext>
  );
}

function ColunaKanban({ coluna, cards }: { coluna: Coluna; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col gap-2 rounded-lg p-2 ${isOver ? "bg-amber-50 ring-2 ring-amber-300" : "bg-zinc-100"}`}
    >
      <header className="flex items-center justify-between px-1 py-1">
        <h2 className="text-sm font-semibold text-zinc-800">{coluna.nome}</h2>
        <span className="rounded-full bg-white px-2 text-xs text-zinc-600">{cards.length}</span>
      </header>
      {cards.map((c) => (
        <CardKanban key={c.id} card={c} />
      ))}
      {!cards.length && <p className="px-1 py-4 text-center text-xs text-zinc-400">Arraste um negócio para cá</p>}
    </section>
  );
}

function CardKanban({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={estilo}
      {...listeners}
      {...attributes}
      className={`touch-manipulation rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm ${
        isDragging ? "z-10 cursor-grabbing opacity-80 shadow-lg" : "cursor-grab"
      }`}
    >
      <Link href={`/negocios/${card.id}`} className="font-medium text-zinc-900 hover:underline">
        {card.contato}
      </Link>
      <p className="truncate text-zinc-600">
        #{card.numero} · {card.titulo}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        {card.valor && <span className="font-medium text-zinc-800">{card.valor}</span>}
        {card.origem && <span className="rounded bg-zinc-100 px-1.5 py-0.5">{card.origem}</span>}
        <span>{card.responsavel}</span>
        <span className="ml-auto">{card.desde}</span>
      </div>
    </article>
  );
}
