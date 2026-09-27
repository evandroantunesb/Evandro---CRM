"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { MoverEtapa } from "@/components/mover-etapa";
import { formatarDataHora } from "@/lib/formatacao";
import type { Card } from "./kanban";

type Coluna = { id: string; nome: string; cor: string | null };

type Campo = "nome" | "etapa" | "valor" | "proxima" | "atualizado";

function Cabecalho({
  campo,
  atual,
  ordem,
  onClicar,
  children,
}: {
  campo: Campo;
  atual: Campo;
  ordem: "asc" | "desc";
  onClicar: (campo: Campo) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button type="button" onClick={() => onClicar(campo)} className="flex items-center gap-1 hover:text-zinc-900">
        {children}
        {atual === campo && (ordem === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

/** Modo Lista para negócios em aberto: mesma consulta/filtros do Kanban, ordenável (dados já carregados). */
export function ListaNegocios({ cards, colunas }: { cards: Card[]; colunas: Coluna[] }) {
  const [campo, setCampo] = useState<Campo>("atualizado");
  const [ordem, setOrdem] = useState<"asc" | "desc">("desc");
  const nomeEtapa = new Map(colunas.map((c) => [c.id, c]));

  const ordenados = useMemo(() => {
    const valor = (c: Card) => {
      switch (campo) {
        case "nome":
          return c.contato.toLocaleLowerCase("pt-BR");
        case "etapa":
          return nomeEtapa.get(c.etapaId)?.nome.toLocaleLowerCase("pt-BR") ?? "";
        case "valor":
          return c.valorNumerico ?? -1;
        case "proxima":
          return c.tarefaVenceEm ?? "9999";
        case "atualizado":
          return c.atualizadoEm;
      }
    };
    const copia = [...cards].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
    return ordem === "asc" ? copia : copia.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, campo, ordem]);

  function alternar(c: Campo) {
    if (c === campo) setOrdem((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setCampo(c);
      setOrdem("asc");
    }
  }

  if (!cards.length) {
    return <p className="text-sm text-zinc-600">Nenhum negócio encontrado para os filtros selecionados.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            <Cabecalho campo="nome" atual={campo} ordem={ordem} onClicar={alternar}>
              Negócio / contato
            </Cabecalho>
            <th className="px-3 py-2 font-medium">Origem</th>
            <Cabecalho campo="etapa" atual={campo} ordem={ordem} onClicar={alternar}>
              Etapa
            </Cabecalho>
            <th className="px-3 py-2 font-medium">Responsável</th>
            <Cabecalho campo="valor" atual={campo} ordem={ordem} onClicar={alternar}>
              Valor
            </Cabecalho>
            <Cabecalho campo="proxima" atual={campo} ordem={ordem} onClicar={alternar}>
              Próxima atividade
            </Cabecalho>
            <Cabecalho campo="atualizado" atual={campo} ordem={ordem} onClicar={alternar}>
              Última atualização
            </Cabecalho>
            <th className="px-3 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((c) => {
            const etapa = nomeEtapa.get(c.etapaId);
            return (
              <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-3 py-2">
                  <Link href={`/negocios/${c.id}`} className="font-medium text-amber-700 hover:underline">
                    {c.contato}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    #{c.numero} · {c.titulo}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {c.origem ? <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{c.origem}</span> : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: etapa?.cor ?? "#d4d4d8" }} />
                    {etapa?.nome ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar nome={c.responsavel} tamanho={20} />
                    {c.responsavel}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{c.valor || "Não informado"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {c.tarefa !== "nenhuma" && c.tarefaVenceEm ? (
                    <span className={c.tarefa === "atrasada" ? "font-medium text-red-700" : "text-zinc-700"}>
                      {c.tarefaTitulo ? `${c.tarefaTitulo} — ` : ""}
                      {formatarDataHora(c.tarefaVenceEm)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">Sem próxima atividade</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{formatarDataHora(c.atualizadoEm)}</td>
                <td className="px-3 py-2">
                  <MoverEtapa negocioId={c.id} etapaAtualId={c.etapaId} etapas={colunas} compacto />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type LinhaFechada = {
  id: string;
  fechado_em: string | null;
  motivo_perda_id: string | null;
};

/** Lista de negócios ganhos ou perdidos (fechados): histórico, sem ações de mover etapa. */
export function ListaFechados({
  status,
  cards,
  linhas,
  motivos,
}: {
  status: "ganho" | "perdido";
  cards: Card[];
  linhas: LinhaFechada[];
  motivos: { id: string; nome: string }[];
}) {
  if (!cards.length) {
    return (
      <p className="text-sm text-zinc-600">
        Nenhum negócio {status === "ganho" ? "ganho" : "perdido"} com esses filtros.
      </p>
    );
  }
  const motivo = new Map(motivos.map((m) => [m.id, m.nome]));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Valor</th>
            <th className="px-3 py-2 font-medium">Responsável</th>
            <th className="px-3 py-2 font-medium">{status === "ganho" ? "Origem" : "Motivo"}</th>
            <th className="px-3 py-2 font-medium">Fechado em</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const l = porId.get(c.id)!;
            return (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <Link href={`/negocios/${c.id}`} className="font-medium text-amber-700 hover:underline">
                    {c.contato}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    #{c.numero} · {c.titulo}
                  </span>
                </td>
                <td className="px-3 py-2">{c.valor || "Não informado"}</td>
                <td className="px-3 py-2">{c.responsavel}</td>
                <td className="px-3 py-2">
                  {status === "ganho" ? c.origem : l.motivo_perda_id ? motivo.get(l.motivo_perda_id) : ""}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{l.fechado_em ? formatarDataHora(l.fechado_em) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
