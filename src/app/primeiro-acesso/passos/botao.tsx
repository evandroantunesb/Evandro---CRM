"use client";

/** "Continuar" dos passos do assistente (botão dourado do quadro), à direita. */
export function BotaoContinuar({ onClick, enviando, rotulo = "Continuar" }: { onClick?: () => void; enviando?: boolean; rotulo?: string }) {
  return (
    <div className="flex justify-end">
      <button
        type={onClick ? "button" : "submit"}
        onClick={onClick}
        disabled={enviando}
        className="inline-flex min-h-[46px] items-center rounded-full bg-[#d4af37] px-6 text-sm font-semibold text-[#0f0f10] disabled:opacity-60"
      >
        {enviando ? "Salvando..." : rotulo}
      </button>
    </div>
  );
}
