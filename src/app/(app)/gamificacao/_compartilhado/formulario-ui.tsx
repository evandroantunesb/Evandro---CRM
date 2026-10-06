import type { ReactNode } from "react";
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

/** Chip "Ativa/Inativa" (ou rótulos próprios) — texto, não só cor. */
export function StatusAtivoGf({ ativa, ativo = "Ativa", inativo = "Inativa" }: { ativa: boolean; ativo?: string; inativo?: string }) {
  return <BadgeGf tom={ativa ? "positivo" : "neutro"}>{ativa ? ativo : inativo}</BadgeGf>;
}
