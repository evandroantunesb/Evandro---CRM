"use client";

import { useState, useTransition } from "react";
import { definirResumoEmail } from "./actions";

/** Chave do resumo diário por e-mail (prévia aprovada em 18/11/2026). Ligado por padrão. */
export function ResumoEmail({ ligadoInicial }: { ligadoInicial: boolean }) {
  const [ligado, setLigado] = useState(ligadoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar() {
    const novo = !ligado;
    setLigado(novo);
    setErro(null);
    iniciar(async () => {
      const r = await definirResumoEmail(novo);
      if (!r.ok) {
        setLigado(!novo);
        setErro(r.mensagem);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <p className="font-medium text-texto">Resumo diário por e-mail</p>
          <p className="mt-0.5 text-zinc-600">
            Todo dia por volta das 7h30, só com os avisos que esperam uma ação sua e ainda não foram vistos no sininho. Dia sem
            pendência, nada é enviado.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label="Resumo diário por e-mail"
          disabled={pendente}
          onClick={alternar}
          className={`relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-raion focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dourado disabled:opacity-60 ${
            ligado ? "bg-carvao" : "bg-linha"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-[3px] h-4 w-4 rounded-full transition-all duration-200 ease-raion ${ligado ? "left-[19px] bg-dourado" : "left-[3px] bg-white"}`}
          />
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
