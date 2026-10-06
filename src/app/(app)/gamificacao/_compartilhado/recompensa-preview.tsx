import { Check, Gift } from "lucide-react";
import { ImagemRecompensaGf } from "./imagem-recompensa-gf";
import { formatarNumeroGf } from "./ui";

/**
 * Linha compacta de recompensa para a prévia da Loja na Visão geral (sem formulário de
 * resgate: resgatar continua só em `/gamificacao/loja`, via "Ver loja"). Mostra ícone, nome
 * completo (quebra em até 2 linhas), custo e — quando `saldo` é informado — a situação:
 * "Disponível" ou "Faltam N moedas" (`custo - saldo`, só aritmética sobre dados já carregados).
 * O nome do componente foi mantido por compatibilidade; o formato agora é uma linha, não um chip.
 */
export function RecompensaChipGf({
  recompensa,
  saldo,
}: {
  recompensa: { id: string; nome: string; custoMoedas: number; imagemUrl?: string | null };
  saldo?: number;
}) {
  const faltam = saldo === undefined ? 0 : Math.max(recompensa.custoMoedas - saldo, 0);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] px-3 py-2.5">
      <ImagemRecompensaGf
        url={recompensa.imagemUrl}
        alt={recompensa.nome}
        className="h-9 w-12 rounded-lg"
        fallback={
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
            <Gift size={18} aria-hidden />
          </span>
        }
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-semibold break-words text-[var(--gf-texto)]">
          {recompensa.nome}
        </p>
        {saldo !== undefined &&
          (faltam === 0 ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--gf-verde)]">
              <Check size={12} aria-hidden /> Disponível para resgate
            </p>
          ) : (
            <p className="gf-t-micro mt-0.5">Faltam {formatarNumeroGf(faltam)} moedas</p>
          ))}
      </div>
      <p className="gf-num shrink-0 text-right text-sm font-bold text-[var(--gf-texto)]">
        {formatarNumeroGf(recompensa.custoMoedas)}
        <span className="block text-xs font-medium text-[var(--gf-texto-sec)]">moedas</span>
      </p>
    </div>
  );
}
