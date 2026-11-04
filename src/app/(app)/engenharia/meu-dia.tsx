import { AlertTriangle, CheckSquare, Eye, Inbox, PencilLine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { IniciarAtuacao } from "@/components/engenharia/iniciar-atuacao";
import { Cartao, Selo } from "@/components/ui";
import { dataCurta, type DiaAgenda, type GrupoMeuDia, type ItemMeuDia, type MeuDia as MeuDiaVM } from "@/lib/engenharia-inicio";

const GRUPOS: { grupo: GrupoMeuDia; rotulo: string; cor: string }[] = [
  { grupo: "atrasado", rotulo: "Atrasado", cor: "text-erro" },
  { grupo: "hoje", rotulo: "Hoje", cor: "text-dourado-texto" },
  { grupo: "semana", rotulo: "Esta semana", cor: "text-texto-2" },
];

const ICONE: Record<ItemMeuDia["tipo"], LucideIcon> = { obra: PencilLine, tarefa: CheckSquare, nova: Inbox, justificativa: AlertTriangle };

/** "Meu dia" (desenho aprovado): o que é meu, por urgência. Atrasado, hoje e o resto da semana. */
export function MeuDia({ dia }: { dia: MeuDiaVM }) {
  return (
    <section aria-label="Meu dia">
      <Cartao titulo="Meu dia" acao={<Selo>{dia.total === 1 ? "1 item" : `${dia.total} itens`}</Selo>}>
        {dia.total === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma ação pendente para você agora.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {GRUPOS.filter((g) => dia[g.grupo].length > 0).map((g) => (
              <section key={g.grupo} aria-label={g.rotulo}>
                <h3 className={`mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${g.cor}`}>{g.rotulo}</h3>
                <ul className="divide-y divide-linha">
                  {dia[g.grupo].map((item) => (
                    <ItemDia key={item.chave} item={item} />
                  ))}
                </ul>
                {g.grupo === "hoje" && dia.maisNaFila > 0 && (
                  <p className="pt-2 text-xs text-zinc-500">
                    E mais {dia.maisNaFila === 1 ? "1 obra nova" : `${dia.maisNaFila} obras novas`} na fila: &ldquo;Iniciar próxima obra da fila&rdquo;, no topo, pega a que espera há mais tempo.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </Cartao>
    </section>
  );
}

function ItemDia({ item }: { item: ItemMeuDia }) {
  const Icone = item.tipo === "obra" && item.titulo.startsWith("Acompanhar") ? Eye : ICONE[item.tipo];
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span
        aria-hidden
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.selo.tom === "negativo" ? "bg-erro/10 text-erro" : item.tipo === "justificativa" ? "bg-dourado/15 text-dourado-texto" : "bg-superficie-2 text-texto-2"}`}
      >
        <Icone size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-texto">{item.titulo}</p>
        <p className="text-xs break-words text-zinc-500">
          <Link href={item.href} className="font-medium text-dourado-texto underline-offset-2 hover:underline">
            {item.detalhe}
          </Link>
        </p>
      </div>
      {item.obraId ? <IniciarAtuacao obraId={item.obraId} rotulo={`Iniciar atuação: ${item.detalhe}`} /> : <Selo tom={item.selo.tom}>{item.selo.texto}</Selo>}
    </li>
  );
}

/** Próximos prazos da Engenharia, por dia (dias úteis da empresa). */
export function ProximosPrazos({ agenda, dias }: { agenda: DiaAgenda[]; dias: number }) {
  return (
    <Cartao titulo="Próximos prazos" acao={<span className="text-xs text-zinc-500">Próximos {dias} dias úteis · prazos da Engenharia</span>}>
      {agenda.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum prazo nos próximos dias.</p>
      ) : (
        <ul className="divide-y divide-linha">
          {agenda.map((d) => {
            const [semana, data] = dataCurta(d.data).split(", ");
            return (
              <li key={d.data} className="flex gap-3.5 py-3 first:pt-0">
                <div className="w-13 shrink-0 rounded-xl bg-superficie-2 py-1.5 text-center">
                  <span className="block text-[11px] font-semibold tracking-wider text-texto-2 uppercase">{semana}</span>
                  <span className="font-titulo text-xl font-semibold text-texto">{data.slice(0, 2)}</span>
                </div>
                <ul className="flex min-w-0 flex-1 flex-col gap-2">
                  {d.itens.map((i) => (
                    <li key={i.chave}>
                      <p className="text-sm font-medium text-texto">{i.rotulo}</p>
                      <Link href={i.href} className="text-xs text-zinc-500 hover:underline">
                        {i.obra}
                      </Link>
                      {i.diasRestantes <= 1 && (
                        <span className="mt-1 block w-fit">
                          <Selo tom="atencao">{i.diasRestantes === 0 ? "Vence hoje" : i.contagem === "corridos" ? "Vence amanhã" : "Vence no próximo dia útil"}</Selo>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}
