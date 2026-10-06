import { Gift } from "lucide-react";

/**
 * Chip compacto de recompensa pra prévia horizontal da Loja na Visão geral
 * (card de altura fixa: saldo à esquerda + até 3 chips à direita — sem lista
 * vertical, sem formulário de resgate embutido; resgatar continua só em
 * `/gamificacao/loja`, via `Ver loja →`). Nome completo só no `title`
 * (tooltip), já que não há espaço pra exibi-lo por extenso no chip.
 */
export function RecompensaChipGf({
  recompensa,
}: {
  recompensa: { id: string; nome: string; custoMoedas: number };
}) {
  return (
    <span
      title={recompensa.nome}
      className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] py-1 pr-2 pl-1 text-[11px]"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
        <Gift size={10} />
      </span>
      <span className="font-medium text-[var(--gf-texto)]">
        {recompensa.custoMoedas.toLocaleString("pt-BR")}
      </span>
    </span>
  );
}
