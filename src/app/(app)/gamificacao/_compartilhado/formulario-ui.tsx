"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BadgeGf } from "./ui";

/** Cabeçalho de um item editável de lista administrativa: nome salvo + resumo em chips. */
export function CabecalhoItemGf({ titulo, children }: { titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <p className="gf-t-item min-w-0 break-words">{titulo}</p>
      {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * Item de lista administrativa que abre pra editar (fechado por padrão): o cabeçalho
 * (nome + chips de resumo) fica sempre visível e funciona como botão; os campos de edição
 * só aparecem ao abrir. Pensado pra listas longas (regras, níveis, conquistas, recompensas)
 * que hoje mostram todo formulário de cada item sempre expandido.
 */
export function ItemColapsavelGf({
  titulo,
  resumo,
  children,
}: {
  titulo: ReactNode;
  resumo?: ReactNode;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown size={16} className={`shrink-0 text-[var(--gf-texto-sec)] transition-transform ${aberto ? "rotate-180" : ""}`} />
          <span className="gf-t-item min-w-0 break-words">{titulo}</span>
        </span>
        {resumo && <span className="flex flex-wrap items-center gap-1.5">{resumo}</span>}
      </button>
      {aberto && <div className="flex flex-col gap-4">{children}</div>}
    </div>
  );
}

/** Chip "Ativa/Inativa" (ou rótulos próprios) — texto, não só cor. */
export function StatusAtivoGf({ ativa, ativo = "Ativa", inativo = "Inativa" }: { ativa: boolean; ativo?: string; inativo?: string }) {
  return <BadgeGf tom={ativa ? "positivo" : "neutro"}>{ativa ? ativo : inativo}</BadgeGf>;
}
