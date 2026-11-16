"use client";

import { useFormStatus } from "react-dom";

/**
 * "Continuar" dos passos do assistente (botão dourado do quadro), à direita. `aviso`: nos passos com cartões que têm
 * "Salvar" próprio, lembra que o Continuar só avança. Como botão de envio (sem `onClick`), mostra o envio do formulário
 * em andamento e não deixa clicar duas vezes.
 */
export function BotaoContinuar({ onClick, enviando, rotulo = "Continuar", aviso }: { onClick?: () => void; enviando?: boolean; rotulo?: string; aviso?: string }) {
  const { pending } = useFormStatus();
  const ocupado = enviando || (!onClick && pending);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {aviso && <p className="text-xs text-texto-2">{aviso}</p>}
      <button
        type={onClick ? "button" : "submit"}
        onClick={onClick}
        disabled={ocupado}
        aria-busy={ocupado || undefined}
        className="inline-flex min-h-[46px] items-center rounded-full bg-[#d4af37] px-6 text-sm font-semibold text-[#0f0f10] disabled:opacity-60"
      >
        {ocupado ? "Salvando..." : rotulo}
      </button>
    </div>
  );
}
