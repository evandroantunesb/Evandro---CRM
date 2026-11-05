"use client";

import { useState, type ReactNode } from "react";
import { FOCO } from "@/components/ui";

export type AcaoLinha = { rotulo: string; conteudo: ReactNode; principal?: boolean };

/**
 * Linha das tabelas do Financeiro: as células vêm prontas do servidor; cada ação abre o formulário dela abaixo da
 * linha, na largura toda (uma de cada vez). `colunas` é a grade do computador (a mesma do cabeçalho); no celular as
 * células empilham.
 */
export function LinhaFinanceiro({ colunas, celulas, acoes }: { colunas: string; celulas: ReactNode[]; acoes: AcaoLinha[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  return (
    <li className="border-b border-linha last:border-0">
      <div className={`flex flex-col gap-1.5 px-4 py-3 text-sm md:grid md:items-center md:gap-4 ${colunas}`}>
        {celulas.map((c, i) => (
          <div key={i} className="min-w-0">
            {c}
          </div>
        ))}
        <div className="flex flex-wrap gap-2 md:justify-end">
          {acoes.map((a, i) => (
            <button
              key={a.rotulo}
              type="button"
              aria-expanded={aberta === i}
              onClick={() => setAberta(aberta === i ? null : i)}
              className={
                a.principal
                  ? `inline-flex min-h-9 items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium whitespace-nowrap text-texto transition-colors hover:border-dourado ${FOCO} ${aberta === i ? "border-dourado" : ""}`
                  : `min-h-9 text-xs font-medium whitespace-nowrap text-texto-2 underline hover:text-texto ${FOCO}`
              }
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      {aberta != null && acoes[aberta] && <div className="px-4 pb-4">{acoes[aberta].conteudo}</div>}
    </li>
  );
}

/** Cabeçalho da tabela (só no computador), na mesma grade das linhas. */
export function CabecalhoTabela({ colunas, titulos }: { colunas: string; titulos: { texto: string; direita?: boolean }[] }) {
  return (
    <div className={`hidden border-b border-linha px-4 py-3 text-xs font-medium text-texto-2 md:grid md:gap-4 ${colunas}`}>
      {titulos.map((t, i) => (
        <span key={i} className={t.direita ? "text-right" : undefined}>
          {t.texto}
        </span>
      ))}
    </div>
  );
}
