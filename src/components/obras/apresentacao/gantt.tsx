import { atividadeAtrasada, escalaCronograma, posicaoAtividade } from "@/lib/obras/apresentacao/calculos";
import type { AtividadeCronograma } from "@/lib/obras/apresentacao/tipos";
import { ROTULO_SETOR } from "@/lib/obras/rotulos";

/** Pixels por dia na linha do tempo (a área rola na horizontal dentro do cartão). */
const PX_DIA = 18;
const LARGURA_ROTULO = 190;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Cronograma estilo construtora: uma linha por atividade, barra do previsto (início → fim) com o
 * progresso informado pela fonte por cima, losango para marcos, linha vertical de hoje e
 * atividade atrasada (fim passou, < 100%) em âmbar. Rolagem horizontal SÓ dentro do cartão
 * (a página nunca estoura) e coluna de nomes fixa à esquerda.
 */
export function Gantt({ atividades, hojeIso }: { atividades: AtividadeCronograma[]; hojeIso: string }) {
  const escala = escalaCronograma(atividades, hojeIso);
  if (!escala) return null;
  const largura = escala.totalDias * PX_DIA;

  return (
    <div
      role="region"
      aria-label="Cronograma da obra (role na horizontal para ver todo o período)"
      tabIndex={0}
      data-sem-gesto
      className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-dourado/40"
    >
      <div className="relative" style={{ width: LARGURA_ROTULO + largura }}>
        {/* Cabeçalho: semanas (segunda-feira) */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500">
          <div className="sticky left-0 z-20 shrink-0 border-r border-zinc-200 bg-zinc-50 px-3 py-2 font-medium" style={{ width: LARGURA_ROTULO }}>
            Atividade
          </div>
          <div className="relative h-8" style={{ width: largura }}>
            {escala.semanas.map((s) => (
              <span key={s.inicio} className="absolute top-0 h-full border-l border-zinc-200 pt-2 pl-1" style={{ left: s.deslocamento * PX_DIA }}>
                {ddmm(s.inicio)}
              </span>
            ))}
            {escala.hoje != null && (
              <span className="absolute top-0 z-10 -translate-x-1/2 rounded bg-carvao px-1.5 py-0.5 text-[10px] font-medium text-offwhite" style={{ left: escala.hoje * PX_DIA + PX_DIA / 2 }}>
                Hoje
              </span>
            )}
          </div>
        </div>

        <ul>
          {atividades.map((a) => {
            const { deslocamento, duracao } = posicaoAtividade(a, escala);
            const atrasada = atividadeAtrasada(a, hojeIso);
            const periodo = a.marco ? ddmm(a.inicio) : `${ddmm(a.inicio)} – ${ddmm(a.fim)}`;
            return (
              <li key={a.id} className="flex border-b border-zinc-100 last:border-b-0">
                <div className="sticky left-0 z-20 shrink-0 border-r border-zinc-200 bg-white px-3 py-2" style={{ width: LARGURA_ROTULO }}>
                  <p className="truncate text-xs font-medium text-zinc-900" title={a.nome}>
                    {a.nome}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {a.setor ? `${ROTULO_SETOR[a.setor]} · ` : ""}
                    {periodo}
                  </p>
                </div>
                <div className="relative h-12" style={{ width: largura }}>
                  {escala.semanas.map((s) => (
                    <span key={s.inicio} aria-hidden className="absolute top-0 h-full border-l border-zinc-100" style={{ left: s.deslocamento * PX_DIA }} />
                  ))}
                  {escala.hoje != null && (
                    <span aria-hidden className="absolute top-0 z-10 h-full w-px bg-carvao/60" style={{ left: escala.hoje * PX_DIA + PX_DIA / 2 }} />
                  )}
                  {a.marco ? (
                    <span
                      className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${a.progresso >= 100 ? "bg-carvao" : "border-2 border-carvao bg-white"}`}
                      style={{ left: deslocamento * PX_DIA + PX_DIA / 2 }}
                      title={`${a.nome}: ${periodo}`}
                    />
                  ) : (
                    <div
                      className={`absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded ${atrasada ? "bg-amber-100 ring-1 ring-amber-400" : "bg-zinc-200"}`}
                      style={{ left: deslocamento * PX_DIA + 2, width: duracao * PX_DIA - 4 }}
                      title={`${a.nome}: ${periodo} · ${a.progresso}%${atrasada ? " · atrasada" : ""}`}
                    >
                      <div className={`h-full ${atrasada ? "bg-amber-400" : "bg-dourado"}`} style={{ width: `${Math.max(0, Math.min(100, a.progresso))}%` }} />
                      <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-carvao">{a.progresso}%</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function LegendaGantt() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm bg-zinc-200" /> Previsto
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm bg-dourado" /> Executado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm bg-amber-400" /> Atrasada
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rotate-45 border-2 border-carvao" /> Marco
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-px bg-carvao" /> Hoje
      </li>
    </ul>
  );
}
