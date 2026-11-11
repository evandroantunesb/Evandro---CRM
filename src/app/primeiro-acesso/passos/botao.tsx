"use client";

/**
 * "Continuar" dos passos do assistente (botão dourado do quadro), à direita. `aviso`: nos passos com cartões que têm
 * "Salvar" próprio, lembra que o Continuar só avança.
 */
export function BotaoContinuar({ onClick, enviando, rotulo = "Continuar", aviso }: { onClick?: () => void; enviando?: boolean; rotulo?: string; aviso?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {aviso && <p className="text-xs text-texto-2">{aviso}</p>}
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
