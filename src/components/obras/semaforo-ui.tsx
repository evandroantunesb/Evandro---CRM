import Link from "next/link";
import type { ReactNode } from "react";
import { formatarMoeda } from "@/lib/formatacao";
import type { EscalonamentoAbertoVM } from "@/lib/obras/completa";
import type { CorSemaforo } from "@/lib/obras/semaforo";

/**
 * Peças do semáforo das Obras (desenho aprovado "Obras — Completa"): o sinal colorido e os cartões de baixo da visão
 * Completa (escalonamentos abertos e as regras). Exceção de cores só em Obras (CLAUDE.md).
 */

export const PONTO: Record<CorSemaforo, string> = { vermelha: "bg-erro", amarela: "bg-dourado", verde: "bg-energia" };
export const TEXTO: Record<CorSemaforo, string> = { vermelha: "text-erro", amarela: "text-dourado-texto", verde: "text-energia" };

function tempoAtras(iso: string, hoje: string) {
  const d = Math.max(0, Math.round((Date.parse(hoje) - Date.parse(iso.slice(0, 10))) / 86_400_000));
  return d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`;
}

export function Sinal({ cor, children }: { cor: CorSemaforo; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${TEXTO[cor]}`}>
      <i aria-hidden className={`size-2.5 shrink-0 rounded-full ${PONTO[cor]}`} />
      {children}
    </span>
  );
}

function Cartao({ sobre, titulo, children }: { sobre: string; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-linha bg-superficie p-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-texto-2 uppercase">{sobre}</p>
        <h2 className="font-titulo text-lg font-semibold text-texto">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

export function Escalonamentos({ itens, hoje }: { itens: EscalonamentoAbertoVM[]; hoje: string }) {
  return (
    <Cartao sobre="Pedem decisão" titulo={`Escalonamentos abertos (${itens.length})`}>
      {itens.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum escalonamento aberto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-linha">
          {itens.map((e) => (
            <li key={e.id} className="flex gap-3 py-2.5">
              <i aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${PONTO[e.cor]}`} />
              <div className="min-w-0">
                <Link href={`/obras/${e.obraId}#escalonamentos`} className="text-sm font-semibold break-words text-texto hover:underline">
                  #{e.obraNumero} · {e.titulo}
                </Link>
                <p className="text-xs text-texto-2">
                  Aberto por {e.abertoPor} {tempoAtras(e.abertoEm, hoje)}
                  {e.valor != null && ` · ${formatarMoeda(e.valor)} fora do programado`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

export function Regras() {
  const regras: [string, string, string][] = [
    ["bg-energia", "Verde", "Etapas e entrega no prazo e custo abaixo de 90% do planejado."],
    ["bg-dourado", "Amarela", "Custo a partir de 90% do planejado; prazo de etapa ou da entrega vencendo em até 3 dias úteis; ou atraso de até 5 dias úteis."],
    ["bg-erro", "Vermelha", "Entrega prevista mais de 5 dias úteis depois da contratada, ou margem projetada negativa por custos não programados."],
    ["bg-[#c9c4b8]", "Vale a pior cor", "Se a obra se encaixa em mais de uma regra, fica com a mais grave."],
  ];
  return (
    <Cartao sobre="Regras" titulo="Como o semáforo decide">
      <ul className="flex flex-col divide-y divide-linha">
        {regras.map(([cor, titulo, texto]) => (
          <li key={titulo} className="flex gap-3 py-3 first:pt-0">
            <i aria-hidden className={`mt-[3px] size-3 shrink-0 rounded-full ${cor}`} />
            <div>
              <p className="text-sm font-semibold text-texto">{titulo}</p>
              <p className="text-xs text-texto-2">{texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
