import { Selo } from "@/components/ui";
import { ROTULO_ESTADO_OBRA, estadosObra, type EstadoObra } from "@/lib/obras/derivados";
import type { ObraResumoVM } from "@/lib/obras/dados";

const TOM: Record<EstadoObra, "neutro" | "positivo" | "negativo" | "atencao"> = {
  cancelada: "negativo",
  pausada: "atencao",
  estorno: "atencao",
  venda_alterada: "atencao",
  fluxo_ausente: "atencao",
  parado: "atencao",
  aguardando: "neutro",
  concluida: "positivo",
};

export function EstadosObra({ obra }: { obra: ObraResumoVM }) {
  const estados = estadosObra(obra);
  if (!estados.length) return <span className="text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {estados.map((e) => (
        <Selo key={e} tom={TOM[e]}>
          {ROTULO_ESTADO_OBRA[e]}
        </Selo>
      ))}
    </div>
  );
}
