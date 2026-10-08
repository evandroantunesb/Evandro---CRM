"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { registrarAnexo } from "@/lib/acoes/anexos";
import { CATEGORIAS_ANEXO, ROTULO_CATEGORIA_ANEXO, type CategoriaAnexo } from "@/lib/tipos";

/**
 * Registra um arquivo que chegou ao Storage mas ficou sem registro (o envio parou no meio),
 * escolhendo a categoria. O servidor confere que o arquivo existe e usa tamanho e tipo reais.
 */
export function RegistrarArquivo({ negocioId, arquivo }: { negocioId: string; arquivo: { caminho: string; nome: string } }) {
  const router = useRouter();
  const id = useId();
  const [pendente, iniciar] = useTransition();
  const [categoria, setCategoria] = useState<CategoriaAnexo>("geral");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Categoria de {arquivo.nome}
      </label>
      <select
        id={id}
        value={categoria}
        disabled={pendente}
        onChange={(e) => setCategoria(e.target.value as CategoriaAnexo)}
        className="rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs"
      >
        {CATEGORIAS_ANEXO.map((c) => (
          <option key={c} value={c}>
            {ROTULO_CATEGORIA_ANEXO[c]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pendente}
        className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50"
        onClick={() =>
          iniciar(async () => {
            const r = await registrarAnexo({ negocioId, caminho: arquivo.caminho, nome: arquivo.nome, categoria });
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
