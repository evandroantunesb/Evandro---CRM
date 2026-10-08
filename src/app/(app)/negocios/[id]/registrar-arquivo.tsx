"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registrarAnexo } from "@/lib/acoes/anexos";

/** Registra um arquivo que chegou ao Storage mas ficou sem registro (o envio parou no meio). */
export function RegistrarArquivo({
  negocioId,
  arquivo,
}: {
  negocioId: string;
  arquivo: { caminho: string; nome: string; tamanho: number; tipoMime: string };
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pendente}
        className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50"
        onClick={() =>
          iniciar(async () => {
            const r = await registrarAnexo({ negocioId, ...arquivo, categoria: "geral" });
            if (!r?.ok) return setErro(r?.mensagem ?? "Não foi possível registrar.");
            setErro(null);
            router.refresh();
          })
        }
      >
        {pendente ? "Registrando..." : "Registrar"}
      </button>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </span>
  );
}
