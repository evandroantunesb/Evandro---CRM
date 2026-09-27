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
import { MoverEtapa } from "@/components/mover-etapa";
import { moverEtapa } from "@/lib/acoes/negocios";
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
  /** Próxima tarefa em aberto do negócio. */
  tarefa: "atrasada" | "hoje" | "futura" | "nenhuma";
  tarefaTitulo: string | null;
  tarefaVenceEm: string | null;
  etiquetas: { nome: string; cor: string | null }[];
};

const CLASSE_TAREFA = {
  atrasada: "bg-red-100 text-red-800",
  hoje: "bg-amber-100 text-amber-800",
  futura: "bg-zinc-100 text-zinc-600",
  nenhuma: "bg-zinc-100 text-zinc-600",
};

type Coluna = { id: string; nome: string };

export function Kanban({
  colunas,
  cards: iniciais,
  metricas,
}: {
  colunas: Coluna[];
  cards: Card[];
  metricas?: { ganhos30d: number; perdidos30d: number };
}) {
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

  const valorTotal = cards.reduce((soma, c) => soma + (c.valorNumerico ?? 0), 0);
  const fechados30d = metricas ? metricas.ganhos30d + metricas.perdidos30d : 0;
  const taxaConversao30d = fechados30d > 0 ? Math.round((metricas!.ganhos30d / fechados30d) * 100) : null;

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      {erro && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
      {metricas && (
        <div className="mb-3 flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm">
          <span className="text-zinc-600">
            <strong className="font-semibold text-zinc-900">{cards.length}</strong> em aberto
          </span>
          <span className="text-zinc-600">
            <strong className="font-semibold text-zinc-900">{formatarMoeda(valorTotal)}</strong> no funil
          </span>
          <span className="text-zinc-600">
            Conversão (30 dias):{" "}
            <strong className="font-semibold text-zinc-900">
              {taxaConversao30d != null ? `${taxaConversao30d}%` : "—"}
            </strong>
            {fechados30d > 0 && (
              <span className="text-zinc-400"> ({metricas!.ganhos30d} ganhos de {fechados30d} fechados)</span>
            )}
          </span>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map((col) => (
          <ColunaKanban key={col.id} coluna={col} colunas={colunas} cards={cards.filter((c) => c.etapaId === col.id)} />
        ))}
      </div>
    </DndContext>
  );
}

function ColunaKanban({ coluna, colunas, cards }: { coluna: Coluna; colunas: Coluna[]; cards: Card[] }) {
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
        <CardKanban key={c.id} card={c} colunas={colunas} />
      ))}
      {!cards.length && <p className="px-1 py-4 text-center text-xs text-zinc-400">Arraste um negócio para cá</p>}
    </section>
  );
}

function CardKanban({ card, colunas }: { card: Card; colunas: Coluna[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={estilo}
      {...listeners}
      {...attributes}
      className={`relative touch-manipulation rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm ${
        isDragging ? "z-10 cursor-grabbing opacity-80 shadow-lg" : "cursor-grab"
      }`}
    >
      <div className="absolute top-2 right-2">
        <MoverEtapa negocioId={card.id} etapaAtualId={card.etapaId} etapas={colunas} compacto />
      </div>
      <Link href={`/negocios/${card.id}`} className="-m-1 block rounded-md p-1 pr-6 hover:bg-zinc-50">
        <p className="font-medium text-zinc-900">{card.contato}</p>
        <p className="truncate text-zinc-600">
          #{card.numero} · {card.titulo}
        </p>
      </Link>
      {(card.etiquetas.length > 0 || card.tarefa === "atrasada" || card.tarefa === "hoje") && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
          {(card.tarefa === "atrasada" || card.tarefa === "hoje") && (
            <span className={`rounded px-1.5 py-0.5 ${CLASSE_TAREFA[card.tarefa]}`}>
              {card.tarefa === "atrasada" ? "🔴" : "🟡"} {card.tarefaTitulo}
              {card.tarefaVenceEm && ` — ${formatarPrazo(card.tarefaVenceEm)}`}
            </span>
          )}
          {card.etiquetas.map((e) => (
            <span key={e.nome} className="rounded px-1.5 py-0.5 text-white" style={{ background: e.cor ?? "#71717a" }}>
              {e.nome}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        {card.valor && <span className="font-medium text-zinc-800">{card.valor}</span>}
        {card.origem && <span className="rounded bg-zinc-100 px-1.5 py-0.5">{card.origem}</span>}
        <span>{card.responsavel}</span>
        <span className="ml-auto">{card.desde}</span>
      </div>
    </article>
  );
}
