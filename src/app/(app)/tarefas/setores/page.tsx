import Link from "next/link";
import { ListaTarefasSetor } from "@/components/tarefas-setor";
import { Cartao } from "@/components/ui";
import { ROTULO_SETOR } from "@/lib/obras/rotulos";
import { TAREFAS, TAREFAS_DO_SETOR, TAREFAS_SETOR, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor, contarAbasTarefasSetor } from "@/lib/tarefas-setor";
import { FILTROS_TAREFAS_SETOR, ROTULO_FILTRO_TAREFAS_SETOR, type FiltroTarefasSetor } from "@/lib/tarefas-setor-regras";

const VAZIO: Record<FiltroTarefasSetor, string> = {
  abertas: "Nenhuma tarefa aberta.",
  minhas: "Nenhuma tarefa com você.",
  fila: "Nenhuma tarefa esperando alguém assumir.",
  pedidas: "Você não tem pedidos abertos.",
  concluidas: "Nenhuma tarefa concluída.",
};

/**
 * Tarefas dos setores (Compras, Engenharia, Operacional). A Operação vê aqui o que é do seu setor; o comercial,
 * os pedidos que fez e os dos negócios que acompanha. Criar é na obra ou no negócio.
 */
export default async function TarefasSetores({ searchParams }: PageProps<"/tarefas/setores">) {
  const { atual } = await exigirPapel(...TAREFAS_SETOR);
  const { ver } = await searchParams;
  const filtro: FiltroTarefasSetor = (FILTROS_TAREFAS_SETOR as readonly string[]).includes(ver as string) ? (ver as FiltroTarefasSetor) : "abertas";
  const supabase = await criarClienteServidor();
  const operacao = pode(atual.papel, TAREFAS_DO_SETOR);
  const [{ tarefas, membrosPorSetor }, porAba, { data: meusSetores }] = await Promise.all([
    carregarTarefasSetor(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, filtro }),
    contarAbasTarefasSetor(supabase, atual.empresaId, atual.membroId),
    operacao
      ? supabase.from("membro_setores_obra").select("setor, capacidade").eq("empresa_id", atual.empresaId).eq("membro_id", atual.membroId)
      : Promise.resolve({ data: [] }),
  ]);
  // Quem executa vê em quais setores atua: é o que decide quais filas aparecem aqui.
  const atuacao = (meusSetores ?? [])
    .filter((s) => s.setor !== "comercial")
    .map((s) => `${ROTULO_SETOR[s.setor as keyof typeof ROTULO_SETOR]} (${s.capacidade === "coordenar" ? "coordena" : "executa"})`)
    .join(", ");
  const atrasadas = tarefas.filter((t) => t.atrasada).length;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">{operacao ? "Tarefas" : "Pedidos aos setores"}</h1>
          <p className="text-sm text-zinc-500">
            {operacao
              ? "O que Compras, Engenharia e Operacional precisam fazer nas obras e nos pedidos do comercial."
              : "Pedidos a Compras, Engenharia e Operacional. Para pedir, abra o negócio ou a obra."}
          </p>
          {operacao && (
            <p className="mt-1 text-sm text-zinc-700">
              {atuacao
                ? `Você atua em: ${atuacao}.`
                : "Você ainda não atua em nenhum setor nesta empresa. Peça ao admin para configurar em Configurações › Usuários."}
            </p>
          )}
        </div>
        {pode(atual.papel, TAREFAS) && (
          <Link href="/tarefas" className="text-sm text-amber-700 hover:underline">
            Minhas tarefas comerciais
          </Link>
        )}
      </div>

      <nav aria-label="Filtro" className="flex flex-wrap gap-2">
        {FILTROS_TAREFAS_SETOR.map((f) => {
          const abertas = f === "concluidas" ? 0 : porAba[f];
          return (
            <Link
              key={f}
              href={f === "abertas" ? "/tarefas/setores" : `/tarefas/setores?ver=${f}`}
              aria-current={f === filtro ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                f === filtro ? "border-dourado bg-dourado/10 text-texto" : "border-linha text-zinc-600 hover:border-dourado"
              }`}
            >
              {ROTULO_FILTRO_TAREFAS_SETOR[f]}
              {abertas > 0 && (
                <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-dourado px-1.5 text-xs font-semibold text-carvao">
                  {abertas}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Cartao titulo={`${ROTULO_FILTRO_TAREFAS_SETOR[filtro]} (${tarefas.length})${atrasadas ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}`}>
        <ListaTarefasSetor tarefas={tarefas} membrosPorSetor={membrosPorSetor} vazio={VAZIO[filtro]} />
      </Cartao>
    </div>
  );
}
