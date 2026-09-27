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
import { CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
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
  atualizadoEm: string;
  /** Próxima tarefa em aberto do negócio. */
  tarefa: "atrasada" | "hoje" | "futura" | "nenhuma";
  tarefaTitulo: string | null;
  tarefaVenceEm: string | null;
  etiquetas: { nome: string; cor: string | null }[];
};

type Coluna = { id: string; nome: string; cor: string | null };

export function Kanban({ colunas, cards: iniciais, funilId }: { colunas: Coluna[]; cards: Card[]; funilId: string }) {
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
          <ColunaKanban
            key={col.id}
            coluna={col}
            colunas={colunas}
            funilId={funilId}
            cards={cards.filter((c) => c.etapaId === col.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}

function ColunaKanban({
  coluna,
  colunas,
  cards,
  funilId,
}: {
  coluna: Coluna;
  colunas: Coluna[];
  cards: Card[];
  funilId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  const soma = cards.reduce((total, c) => total + (c.valorNumerico ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg p-2 ${isOver ? "bg-amber-50 ring-2 ring-amber-300" : "bg-zinc-100"}`}
    >
      <header className="px-1 pt-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-zinc-800" title={coluna.nome}>
            {coluna.nome}
          </h2>
          <span className="shrink-0 rounded-full bg-white px-2 text-xs text-zinc-600">{cards.length}</span>
        </div>
        {soma > 0 && <p className="mt-0.5 text-xs text-zinc-500">{formatarMoeda(soma)}</p>}
        <div className="mt-2 h-[3px] rounded-full" style={{ background: coluna.cor ?? "#d4d4d8" }} />
      </header>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <CardKanban key={c.id} card={c} colunas={colunas} />
        ))}
        {!cards.length && <p className="px-1 py-4 text-center text-xs text-zinc-400">Arraste um negócio para cá</p>}
        <Link
          href={`/negocios/novo?funil=${funilId}&etapa=${coluna.id}`}
          className="mt-1 flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 py-1.5 text-xs font-medium text-zinc-500 hover:border-dourado hover:text-carvao"
        >
          <Plus size={13} /> Adicionar negócio
        </Link>
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
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <Avatar nome={card.responsavel} tamanho={22} />
        <MoverEtapa negocioId={card.id} etapaAtualId={card.etapaId} etapas={colunas} compacto />
      </div>
      <Link href={`/negocios/${card.id}`} className="-m-1 block rounded-md p-1 pr-16 hover:bg-zinc-50">
        <p className="truncate font-medium text-zinc-900">{card.contato}</p>
        <p className="truncate text-zinc-600">
          #{card.numero} · {card.titulo}
        </p>
      </Link>
      {(card.origem || card.etiquetas.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
          {card.origem && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">{card.origem}</span>}
          {card.etiquetas.map((e) => (
            <span key={e.nome} className="rounded px-1.5 py-0.5 text-white" style={{ background: e.cor ?? "#71717a" }}>
              {e.nome}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-x-2 text-xs text-zinc-500">
        {card.valor && <span className="font-medium text-zinc-800">{card.valor}</span>}
        <PrazoOuDesde card={card} />
      </div>
    </article>
  );
}
