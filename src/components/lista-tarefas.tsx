import Link from "next/link";
import { formatarPrazo, situacaoPrazo } from "@/lib/crm";
import { alternarConclusao, apagarTarefa } from "@/lib/acoes/tarefas";
import { ROTULO_TIPO_TAREFA, type TipoTarefa } from "@/lib/tipos";

export type TarefaLista = {
  id: string;
  titulo: string;
  tipo: TipoTarefa;
  vence_em: string;
  concluida_em: string | null;
  responsavel: string | null;
  podeApagar: boolean;
  negocio?: { id: string; rotulo: string } | null;
};

const COR = { atrasada: "text-red-700", hoje: "text-amber-700", futura: "text-zinc-500" };

/** Calcula a situação e o texto do prazo de cada tarefa em relação a agora. */
function comPrazo(tarefas: TarefaLista[]) {
  const agora = Date.now();
  return tarefas.map((t) => ({
    ...t,
    situacao: situacaoPrazo(t.vence_em, agora),
    prazo: formatarPrazo(t.vence_em, agora),
  }));
}

export function ListaTarefas({ tarefas, vazio }: { tarefas: TarefaLista[]; vazio: string }) {
  if (!tarefas.length) return <p className="text-sm text-zinc-500">{vazio}</p>;
  return (
    <ul className="flex flex-col">
      {comPrazo(tarefas).map((t) => {
        const concluida = t.concluida_em != null;
        const situacao = t.situacao;
        return (
          <li key={t.id} className="flex items-start gap-3 border-t border-zinc-100 py-2 text-sm first:border-t-0">
            <form action={alternarConclusao}>
              <input type="hidden" name="tarefaId" value={t.id} />
              <input type="hidden" name="concluir" value={String(!concluida)} />
              <button
                aria-label={concluida ? "Marcar como pendente" : "Concluir tarefa"}
                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs ${
                  concluida
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-zinc-400 bg-white hover:border-green-600"
                }`}
              >
                {concluida ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={concluida ? "text-zinc-400 line-through" : "text-zinc-900"}>
                <span className="font-medium">{ROTULO_TIPO_TAREFA[t.tipo]}:</span> {t.titulo}
              </p>
              <p className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
                <span className={concluida ? "" : COR[situacao]}>
                  {!concluida && situacao === "atrasada" ? "Atrasada · " : ""}
                  {t.prazo}
                </span>
                {t.responsavel && <span>{t.responsavel}</span>}
                {t.negocio && (
                  <Link href={`/negocios/${t.negocio.id}`} className="text-amber-700 hover:underline">
                    {t.negocio.rotulo}
                  </Link>
                )}
              </p>
            </div>
            {t.podeApagar && (
              <form action={apagarTarefa}>
                <input type="hidden" name="tarefaId" value={t.id} />
                <button className="text-xs text-zinc-400 hover:text-red-700" aria-label="Apagar tarefa">
                  Apagar
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
