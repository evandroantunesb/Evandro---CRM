"use client";

import { useActionState } from "react";
import { Check, Coins, Gift, Lock } from "lucide-react";
import { Mensagem } from "@/components/ui";
import { useImagemRecompensa } from "../_compartilhado/imagem-recompensa-gf";
import { BarraProgressoGf, formatarNumeroGf } from "../_compartilhado/ui";
import { resgatarRecompensa } from "./actions";

/**
 * Cartão de recompensa da Loja: imagem 4:3 no topo (ou, sem imagem / se ela falhar, o ícone), nome, descrição, custo e botão de resgate. O saldo
 * (`saldo`, real — pode ser negativo) só alimenta a situação visual: "Faltam N moedas"
 * (`custo - saldo`) e a barra de progresso até o custo. O bloqueio e a ação de resgate são os
 * mesmos de antes (`semSaldo` desabilita; o servidor valida de novo).
 */
export function CartaoRecompensa({
  recompensa,
  saldo,
}: {
  recompensa: { id: string; nome: string; descricao: string; custoMoedas: number; imagemUrl?: string | null };
  saldo: number;
}) {
  const imagem = useImagemRecompensa(recompensa.imagemUrl);
  const [resultado, acao, pendente] = useActionState(resgatarRecompensa, null);
  const semSaldo = saldo < recompensa.custoMoedas;
  const faltam = recompensa.custoMoedas - saldo;
  const progresso = recompensa.custoMoedas > 0 ? (Math.max(saldo, 0) / recompensa.custoMoedas) * 100 : 100;

  return (
    <form
      action={acao}
      className="flex h-full min-w-0 flex-col gap-4 rounded-xl border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-colors focus-within:border-[var(--gf-dourado-borda)] hover:border-[var(--gf-dourado-borda)] sm:p-5"
    >
      <input type="hidden" name="recompensaId" value={recompensa.id} />
      {imagem.url && (
        <div className="-mx-4 -mt-4 aspect-[4/3] shrink-0 overflow-hidden rounded-t-xl bg-[var(--gf-surface)] sm:-mx-5 sm:-mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage; o otimizador do Next não se aplica */}
          <img
            src={imagem.url}
            alt={recompensa.nome}
            loading="lazy"
            decoding="async"
            onError={imagem.aoFalhar}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-3">
        {!imagem.url && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
            <Gift size={24} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="gf-t-item text-base break-words">{recompensa.nome}</h3>
          {recompensa.descricao && (
            <p className="gf-t-aux mt-1 line-clamp-3 break-words">{recompensa.descricao}</p>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <p className="flex items-center gap-2">
          <Coins size={18} className="shrink-0 text-[var(--gf-dourado)]" aria-hidden />
          <span className="gf-t-kpi-sm gf-num">{formatarNumeroGf(recompensa.custoMoedas)}</span>
          <span className="text-sm text-[var(--gf-texto-sec)]">moedas</span>
        </p>

        {semSaldo ? (
          <BarraProgressoGf
            valor={progresso}
            tom="dourado"
            tamanho="sm"
            rotulo={`Seu saldo cobre ${Math.round(progresso)}% do custo de ${recompensa.nome}`}
          />
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--gf-verde)]">
            <Check size={16} aria-hidden /> Você tem moedas suficientes
          </p>
        )}

        <button
          type="submit"
          disabled={pendente || semSaldo}
          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            semSaldo
              ? "cursor-not-allowed border border-dashed border-[var(--gf-neutro-barra)] bg-transparent text-[var(--gf-texto-sec)]"
              : "bg-[var(--gf-verde)] text-[var(--gf-on-verde)] hover:bg-[color-mix(in_srgb,var(--gf-verde)_82%,white)] disabled:opacity-60"
          }`}
        >
          {semSaldo ? (
            <>
              <Lock size={15} aria-hidden />
              Faltam {formatarNumeroGf(faltam)} moedas
            </>
          ) : pendente ? (
            "Resgatando…"
          ) : (
            "Resgatar"
          )}
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
