import Link from "next/link";
import { ListaTarefasSetor } from "@/components/tarefas-setor";
import { Cartao, Selo } from "@/components/ui";
import { agruparObrasEngenharia } from "@/lib/engenharia-regras";
import { carregarObras } from "@/lib/obras/dados";
import { ROTULO_ESTADO_SETOR, rotuloAguardando, rotuloStatus } from "@/lib/obras/rotulos";
import { ENGENHARIA, OBRAS, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor, contarAbasTarefasSetor } from "@/lib/tarefas-setor";
import { ROTULO_FILTRO_TAREFAS_SETOR, type FiltroTarefasSetor } from "@/lib/tarefas-setor-regras";

// Sem "Pedidas por mim": a Engenharia vê o que é do setor, não o que pediu a outros.
const FILTROS = ["abertas", "minhas", "fila", "concluidas"] as const satisfies readonly FiltroTarefasSetor[];
const VAZIO: Record<(typeof FILTROS)[number], string> = {
  abertas: "Nenhuma tarefa de Engenharia aberta.",
  minhas: "Nenhuma tarefa com você.",
  fila: "Nenhuma tarefa esperando alguém assumir.",
  concluidas: "Nenhuma tarefa concluída.",
};

const formatarPotencia = (kwp: number | null) =>
  kwp == null ? "" : ` · ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kwp)} kWp`;

/**
 * Engenharia: a fila de tarefas do setor e as obras em andamento por etapa do projeto. Admin e gestor acompanham;
 * `operacao` vê só se atua em Engenharia. Tudo sob RLS: a tela não decide permissão, só monta o que chega.
 */
export default async function Engenharia({ searchParams }: PageProps<"/engenharia">) {
  const { atual } = await exigirPapel(...ENGENHARIA);
  const { ver } = await searchParams;
  const filtro = (FILTROS as readonly string[]).includes(ver as string) ? (ver as (typeof FILTROS)[number]) : "abertas";
  const supabase = await criarClienteServidor();

  const { data: meusSetores } = await supabase
    .from("membro_setores_obra")
    .select("setor, capacidade")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", atual.membroId)
    .eq("setor", "engenharia");
  const atua = (meusSetores ?? []).length > 0;
  const coordena = (meusSetores ?? []).some((s) => s.capacidade === "coordenar");

  if (atual.papel === "operacao" && !atua) {
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Engenharia</h1>
        <p className="text-sm text-zinc-600">Você não atua em Engenharia nesta empresa. Peça ao admin para configurar em Configurações › Usuários.</p>
      </div>
    );
  }

  const [{ tarefas, membrosPorSetor }, porAba, { obras }] = await Promise.all([
    carregarTarefasSetor(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, filtro, setor: "engenharia" }),
    contarAbasTarefasSetor(supabase, atual.empresaId, atual.membroId, "engenharia"),
    carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel }),
  ]);
  const grupos = agruparObrasEngenharia(obras, (s) => rotuloStatus("engenharia", s));
  const totalObras = grupos.reduce((n, g) => n + g.obras.length, 0);
  const atrasadas = tarefas.filter((t) => t.atrasada).length;
  const verObra = pode(atual.papel, OBRAS);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Engenharia</h1>
        <p className="text-sm text-zinc-500">As tarefas do setor e as obras em andamento por etapa do projeto.</p>
        {atual.papel === "operacao" && (
          <p className="mt-1 text-sm text-zinc-700">Você atua em Engenharia como {coordena ? "coordenador" : "executor"}.</p>
        )}
      </div>

      <nav aria-label="Filtro" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const abertas = f === "concluidas" ? 0 : porAba[f];
          return (
            <Link
              key={f}
              href={f === "abertas" ? "/engenharia" : `/engenharia?ver=${f}`}
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

      <Cartao titulo={`Obras na Engenharia (${totalObras})`}>
        {totalObras === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma obra em andamento na Engenharia.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {grupos
              .filter((g) => g.obras.length > 0)
              .map((g) => (
                <section key={g.status} aria-label={g.rotulo}>
                  <h3 className="mb-2 text-sm font-medium text-texto">
                    {g.rotulo} <span className="text-zinc-500">({g.obras.length})</span>
                  </h3>
                  <ul className="divide-y divide-linha rounded-lg border border-linha">
                    {g.obras.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-texto">
                            {verObra ? (
                              <Link href={`/obras/${o.id}`} className="hover:underline">
                                Obra #{o.numero} · {o.clienteNome}
                              </Link>
                            ) : (
                              `Obra #${o.numero} · ${o.clienteNome}`
                            )}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {o.cidadeUf}
                            {formatarPotencia(o.potenciaKwp)}
                            {o.principalNome ? ` · ${o.principalNome}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {o.aguardando && <Selo tom="atencao">{rotuloAguardando(o.aguardando)}</Selo>}
                          {o.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        )}
      </Cartao>
    </div>
  );
}
