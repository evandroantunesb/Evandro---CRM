"use client";

import { useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { LinhaRankingGf, PodioGf } from "./ranking-ui";
import { EstadoVazioGf } from "./ui";

type RankingLinha = { posicao: number; membroId: string; nome: string; total: number; avatarUrl?: string };

const ABAS = [
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "geral", rotulo: "Geral" },
] as const;
type AbaChave = (typeof ABAS)[number]["chave"];

/**
 * Ranking com abas Semana/Mês/Geral — cliente porque a troca de aba é só
 * visual (as 3 janelas já vêm prontas do servidor via `ranking_gamificacao`,
 * sem round-trip novo). Pódio + lista (top 5 na Visão geral pessoal; completa
 * na gerencial), com a altura definida pelo conteúdo.
 *
 * Props opcionais (usadas pela visão gerencial; o uso pessoal não as passa):
 * `titulo`/`subtitulo` desenham um cabeçalho próprio acima das abas; `rolagem`
 * deixa a lista completa rolar dentro do cartão (que então tem altura máxima);
 * `membroAtualId` pode faltar (gestor/admin não competem, então ninguém é
 * destacado como "Você").
 */
export function RankingTabsGf({
  listas,
  membroAtualId,
  titulo,
  subtitulo,
  rolagem = false,
}: {
  listas: Record<AbaChave, RankingLinha[]>;
  membroAtualId?: string;
  titulo?: ReactNode;
  subtitulo?: string;
  rolagem?: boolean;
}) {
  const [aba, setAba] = useState<AbaChave>("mes");
  const ranking = listas[aba];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {titulo && (
        <div className="mb-4 shrink-0">
          <h2 className="gf-t-secao flex min-w-0 items-center gap-2">{titulo}</h2>
          {subtitulo && <p className="gf-t-aux mt-0.5">{subtitulo}</p>}
        </div>
      )}
      <div
        role="group"
        aria-label="Período do ranking"
        className="mb-4 flex shrink-0 gap-1 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] p-1"
      >
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            aria-pressed={aba === a.chave}
            onClick={() => setAba(a.chave)}
            className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
              aba === a.chave
                ? "bg-[var(--gf-verde-10)] font-semibold text-[var(--gf-verde)] ring-1 ring-[var(--gf-verde-borda)]"
                : "text-[var(--gf-texto-sec)] hover:text-[var(--gf-texto)]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${!ranking.length ? "items-center justify-center" : ""}`}>
        {!ranking.length ? (
          <EstadoVazioGf Icone={Users} compacto>
            Ninguém pontuou neste período ainda.
          </EstadoVazioGf>
        ) : (
          <>
            {ranking.length >= 2 && (
              <div className="mb-4 shrink-0">
                <PodioGf itens={ranking.slice(0, 3)} membroAtualId={membroAtualId} />
              </div>
            )}
            <ul
              className={`flex min-h-0 flex-1 flex-col gap-1 ${rolagem ? "overflow-y-auto pr-1" : ""}`}
              aria-label="Classificação"
            >
              {ranking.map((r) => (
                <LinhaRankingGf key={r.membroId} item={r} membroAtualId={membroAtualId} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
