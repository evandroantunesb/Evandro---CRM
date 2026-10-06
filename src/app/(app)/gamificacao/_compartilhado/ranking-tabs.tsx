"use client";

import { useState } from "react";
import { Crown, Users } from "lucide-react";
import { EstadoVazioGf, IniciaisAvatarGf } from "./ui";

type RankingLinha = { posicao: number; membroId: string; nome: string; total: number };

const ABAS = [
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "geral", rotulo: "Geral" },
] as const;
type AbaChave = (typeof ABAS)[number]["chave"];

/**
 * Ranking com abas Semana/Mês/Geral — cliente porque a troca de aba é só
 * visual (as 3 janelas já vêm prontas do servidor via `ranking_gamificacao`,
 * sem round-trip novo). Pódio + lista top 5, sempre dentro da altura fixa do
 * card (wireframe da Visão geral): `overflow-hidden` em vez de deixar o
 * conteúdo empurrar o card, já que as listas chegam pré-limitadas a 5.
 */
export function RankingTabsGf({
  listas,
  membroAtualId,
}: {
  listas: Record<AbaChave, RankingLinha[]>;
  membroAtualId: string;
}) {
  const [aba, setAba] = useState<AbaChave>("mes");
  const ranking = listas[aba];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 gap-1 rounded-lg bg-[var(--gf-surface-alta)] p-0.5 text-xs">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`flex-1 rounded-md px-2 py-1 font-medium transition-colors ${
              aba === a.chave
                ? "bg-[var(--gf-surface)] text-[var(--gf-texto)] shadow-sm"
                : "text-[var(--gf-texto-sec)] hover:text-[var(--gf-texto)]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${!ranking.length ? "items-center justify-center" : ""}`}
      >
        {!ranking.length ? (
          <EstadoVazioGf Icone={Users} compacto>
            Ninguém pontuou neste período ainda.
          </EstadoVazioGf>
        ) : (
          <>
            {ranking.length >= 2 && (
              <div className="mb-3 flex shrink-0 items-end justify-center gap-3">
                {[ranking[1], ranking[0], ranking[2]].map(
                  (r) =>
                    r && (
                      <div
                        key={r.membroId}
                        className={`flex flex-col items-center gap-1 ${r.posicao === 1 ? "pb-0" : "pb-3"}`}
                      >
                        {r.posicao === 1 && <Crown size={16} className="text-[var(--gf-dourado)]" />}
                        <IniciaisAvatarGf
                          nome={r.nome}
                          tamanho={r.posicao === 1 ? 44 : 36}
                          tom={r.posicao === 1 ? "dourado" : "neutro"}
                        />
                        <span className="max-w-20 truncate text-xs font-medium text-[var(--gf-texto)]">
                          {r.nome}
                        </span>
                        <span className="text-[11px] text-[var(--gf-texto-sec)]">
                          {r.total.toLocaleString("pt-BR")} XP
                        </span>
                      </div>
                    ),
                )}
              </div>
            )}
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
              {ranking.map((r) => (
                <li
                  key={r.membroId}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                    r.membroId === membroAtualId ? "bg-[var(--gf-verde-10)]" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-[var(--gf-texto-sec)]">
                    {r.posicao}
                  </span>
                  <span
                    className={`flex-1 truncate ${r.membroId === membroAtualId ? "font-medium text-[var(--gf-verde)]" : "text-[var(--gf-texto)]"}`}
                  >
                    {r.membroId === membroAtualId ? "Você" : r.nome}
                  </span>
                  <span className="font-medium text-[var(--gf-texto)]">
                    {r.total.toLocaleString("pt-BR")} XP
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
