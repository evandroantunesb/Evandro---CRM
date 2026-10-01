import { ROTULO_STATUS_TECNICO, type StatusTecnico } from "@/lib/equipamentos";

// Paleta da marca: sem verde (só WhatsApp) e sem vermelho (só perda/erro) — CLAUDE.md.
const ESTILO: Record<StatusTecnico, string> = {
  completo: "bg-dourado/15 text-carvao",
  verificado: "bg-carvao text-offwhite",
  em_revisao: "border border-dourado bg-white text-carvao",
  incompleto: "bg-amber-100 text-amber-800",
  descontinuado: "bg-zinc-100 text-zinc-500",
};

const DICA: Record<StatusTecnico, string> = {
  completo: "Dados técnicos completos — entra no dimensionamento automático.",
  verificado: "Conferido pelo admin — entra no dimensionamento automático.",
  em_revisao: "Em revisão pelo admin — não entra no dimensionamento automático até ser validado.",
  incompleto: "Faltam dados técnicos — não entra no dimensionamento automático.",
  descontinuado: "Fora de linha — não entra no dimensionamento automático.",
};

export function SeloStatusTecnico({ status }: { status: StatusTecnico }) {
  return (
    <span
      title={DICA[status]}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ESTILO[status]}`}
    >
      {ROTULO_STATUS_TECNICO[status]}
    </span>
  );
}
