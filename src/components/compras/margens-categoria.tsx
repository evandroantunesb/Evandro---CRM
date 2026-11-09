"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { salvarMargensCompra } from "@/lib/acoes/compras-precos";
import { CATEGORIAS_MATERIAL, ROTULO_CATEGORIA_MATERIAL } from "@/lib/compras/precos";
import { MARGENS_ZERADAS, lerMargemPercentual, margemEmTexto, type MargensCategoria } from "@/lib/compras/margens";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * "Margem por categoria" da tabela de preços (prévia aprovada "Compras P4 · Margens"): venda sugerida = melhor custo ×
 * (1 + margem). Editam o admin e o gestor; os demais que veem a tabela só consultam. O banco confere de novo.
 */
export function MargensCategoriaCartao({ margens, podeEditar }: { margens: MargensCategoria; podeEditar: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const novas: MargensCategoria = { ...MARGENS_ZERADAS };
    for (const c of CATEGORIAS_MATERIAL) {
      const m = lerMargemPercentual(String(f.get(c) ?? ""));
      if (m == null) {
        setResultado({ ok: false, mensagem: `Confira a margem de ${ROTULO_CATEGORIA_MATERIAL[c]} (de 0 a 500%).` });
        return;
      }
      novas[c] = m;
    }
    setEnviando(true);
    setResultado(null);
    const r = await salvarMargensCompra(novas);
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.refresh();
  };

  return (
    <section className="painel p-4 md:p-5">
      <p className="text-xs font-medium text-texto-2">Precificação</p>
      <h2 className="font-titulo text-lg text-texto">Margem por categoria</h2>
      <p className="mt-1 text-xs text-texto-2">
        Venda sugerida = melhor custo + margem da categoria. {podeEditar ? "Muda só os próximos cálculos." : "Editam o admin e o gestor."}
      </p>
      {podeEditar ? (
        <form onSubmit={enviar} className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-2">
            {CATEGORIAS_MATERIAL.map((c) => (
              <label key={c} className="contents text-sm">
                <span className="text-texto-2">{ROTULO_CATEGORIA_MATERIAL[c]}</span>
                <span className="flex items-center gap-1">
                  <input
                    name={c}
                    inputMode="decimal"
                    defaultValue={margemEmTexto(margens[c])}
                    aria-label={`Margem de ${ROTULO_CATEGORIA_MATERIAL[c]} (%)`}
                    className={`${CLASSE_ENTRADA} w-full text-right tabular-nums`}
                  />
                  <span className="text-sm text-texto-2" aria-hidden>
                    %
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar margens"}
          </Botao>
          <Mensagem resultado={resultado} />
        </form>
      ) : (
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          {CATEGORIAS_MATERIAL.map((c) => (
            <div key={c} className="contents">
              <dt className="text-texto-2">{ROTULO_CATEGORIA_MATERIAL[c]}</dt>
              <dd className="text-right tabular-nums">{margemEmTexto(margens[c])}%</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
