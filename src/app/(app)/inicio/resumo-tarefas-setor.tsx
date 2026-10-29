import Link from "next/link";
import { Cartao } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor } from "@/lib/tarefas-setor";
import type { Papel } from "@/lib/tipos";

/** Resumo das tarefas dos setores na Início de quem executa nos setores (Compras, Engenharia, Operacional). */
export async function ResumoTarefasSetor({ empresaId, membroId, papel }: { empresaId: string; membroId: string; papel: Papel }) {
  const supabase = await criarClienteServidor();
  const { tarefas } = await carregarTarefasSetor(supabase, { empresaId, membroId, papel, filtro: "abertas" });
  const comigo = tarefas.filter((t) => t.responsavel?.id === membroId).length;
  const naFila = tarefas.filter((t) => t.responsavel === null).length;
  const atrasadas = tarefas.filter((t) => t.atrasada).length;
  const itens: [string, number, string][] = [
    ["Comigo", comigo, "/tarefas/setores?ver=minhas"],
    ["Na fila do setor", naFila, "/tarefas/setores?ver=fila"],
    ["Atrasadas", atrasadas, "/tarefas/setores"],
  ];
  return (
    <Cartao titulo="Tarefas">
      <div className="grid grid-cols-3 gap-3">
        {itens.map(([rotulo, valor, href]) => (
          <Link key={rotulo} href={href} className="flex flex-col rounded-lg border border-linha px-3 py-2 hover:border-dourado">
            <span className={`text-2xl font-semibold ${rotulo === "Atrasadas" && valor > 0 ? "text-red-700" : "text-texto"}`}>{valor}</span>
            <span className="text-xs text-zinc-500">{rotulo}</span>
          </Link>
        ))}
      </div>
    </Cartao>
  );
}
