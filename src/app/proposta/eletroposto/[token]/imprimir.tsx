"use client";

/** Abre a impressão do navegador; no destino, "Salvar como PDF" gera o arquivo. */
export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir / Salvar PDF
    </button>
  );
}
