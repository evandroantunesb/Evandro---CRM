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
import { SeloTemperatura } from "@/components/selo-temperatura";
import { formatarMoeda, formatarPrazo } from "@/lib/formatacao";
import type { TemperaturaNegocio } from "@/lib/temperatura";

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
  /** Só em negócio aberto; nulo quando não calculada. */
  temperatura: TemperaturaNegocio | null;
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
    // `id` fixo: os ids de acessibilidade do dnd-kit (aria-describedby) saem iguais no servidor e no navegador.
    <DndContext id="kanban-negocios" sensors={sensores} onDragEnd={aoSoltar}>
      {/* Celular: uma coluna por vez, encaixando ao deslizar; no computador, rolagem livre. */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:snap-none md:px-0">
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
      aria-label={coluna.nome}
      className={`flex w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 rounded-2xl p-2 transition-[background-color,box-shadow] duration-200 ease-raion md:w-72 ${
        // Faixa um pouco mais funda que o fundo nos dois temas: o cartão (superfície) fica sempre acima dela.
        isOver ? "bg-dourado/10 ring-2 ring-dourado/50" : "bg-[light-dark(rgb(15_15_16/0.04),rgb(0_0_0/0.35))]"
      }`}
    >
      <header className="flex flex-col gap-0.5 px-2 pt-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: coluna.cor ?? "var(--color-texto-2)" }} aria-hidden />
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-texto" title={coluna.nome}>
            {coluna.nome}
          </h2>
          <span className="ml-auto shrink-0 rounded-full bg-superficie px-2 py-0.5 text-xs font-medium text-texto-2 tabular-nums">
            {cards.length}
          </span>
        </div>
        <p className="pl-4 text-xs text-texto-2 tabular-nums">{soma > 0 ? formatarMoeda(soma) : "Sem valor"}</p>
      </header>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <CardKanban key={c.id} card={c} colunas={colunas} etiquetas={etiquetas} motivos={motivos} />
        ))}
        {!cards.length && <p className="px-2 py-6 text-center text-xs text-texto-2">Nenhum negócio nesta etapa</p>}
        {coluna.inicial && (
          <Link
            href={`/negocios/novo?funil=${funilId}&etapa=${coluna.id}`}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-texto-2 transition-colors duration-200 ease-raion hover:bg-superficie hover:text-texto md:min-h-9"
          >
            <Plus size={15} /> Adicionar negócio
          </Link>
        )}
      </div>
    </section>
  );
}

/** Prazo da próxima tarefa (com alerta se atrasada) ou, na falta dela, "há X tempo" desde que entrou na etapa. */
function PrazoOuDesde({ card }: { card: Card }) {
  if (card.tarefa !== "nenhuma" && card.tarefaVenceEm) {
    const tom = { atrasada: "bg-erro/10 font-medium text-erro", hoje: "bg-dourado/15 font-medium text-dourado-texto", futura: "" }[card.tarefa];
    return (
      <span title={card.tarefaTitulo ?? undefined} className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 ${tom}`}>
        <CalendarClock size={12} aria-hidden />
        {formatarPrazo(card.tarefaVenceEm)}
      </span>
    );
  }
  return <span className="ml-auto px-2">{card.desde}</span>;
}

function CardKanban({
  card,
  colunas,
  etiquetas,
  motivos,
}: {
  card: Card;
  colunas: Coluna[];
  etiquetas: EtiquetaDisponivel[];
  motivos: MotivoDisponivel[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={estilo}
      {...listeners}
      {...attributes}
      className={`painel relative touch-manipulation p-3.5 text-sm transition-[translate,rotate,opacity] duration-200 ease-raion ${
        isDragging ? "z-10 rotate-[1.5deg] cursor-grabbing opacity-90" : "cursor-grab hover:-translate-y-0.5"
      }`}
    >
      <div className="absolute top-2.5 right-2 flex items-center gap-0.5">
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
      <Link
        href={`/negocios/${card.id}`}
        className="-m-1 block rounded-lg p-1 pr-20 focus-visible:ring-2 focus-visible:ring-dourado/60 focus-visible:outline-none md:pr-16"
      >
        <p className="truncate text-[15px] font-medium text-texto">{card.contato}</p>
        <p className="truncate text-[13px] text-texto-2">
          #{card.numero} · {card.titulo}
        </p>
      </Link>
      {(card.temperatura || card.origem || card.etiquetas.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1 text-xs">
          {card.temperatura && <SeloTemperatura valor={card.temperatura} />}
          {card.origem && <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-texto-2">{card.origem}</span>}
          {card.etiquetas.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-superficie-2 px-2 py-0.5 text-texto">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.cor ?? "#8a8a92" }} aria-hidden />
              {e.nome}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-x-2 border-t border-linha pt-2.5 text-xs text-texto-2">
        {card.valor && <span className="text-[13px] font-semibold text-texto tabular-nums">{card.valor}</span>}
        {card.comentarios > 0 && (
          <span className="flex items-center gap-0.5" title={`${card.comentarios} comentário(s)`}>
            <MessageCircle size={12} aria-hidden />
            {card.comentarios}
          </span>
        )}
        <PrazoOuDesde card={card} />
      </div>
    </article>
  );
}
