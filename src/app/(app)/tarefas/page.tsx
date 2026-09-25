import { ListaTarefas, type TarefaLista } from "@/components/lista-tarefas";
import { NovaTarefa } from "@/components/nova-tarefa";
import { Botao, Cartao, Selecao } from "@/components/ui";
import { carregarConfiguracao, situacaoPrazo } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { TipoTarefa } from "@/lib/tipos";

export default async function Tarefas({ searchParams }: PageProps<"/tarefas">) {
  const { atual } = await exigirPapel();
  const filtros = await searchParams;
  const podeVerOutros = atual.papel !== "vendedor";
  // Padrão: as minhas. Admin e gestor podem ver de outro usuário ou de todos que enxergam.
  const escolhido = typeof filtros.responsavel === "string" ? filtros.responsavel : atual.membroId;
  const responsavel = podeVerOutros ? escolhido : atual.membroId;

  const config = await carregarConfiguracao(atual.empresaId);
  const supabase = await criarClienteServidor();
  const campos =
    "id, titulo, tipo, vence_em, concluida_em, responsavel_id, criado_por, negocios(id, numero, contatos(nome))";
  let pendentesQ = supabase
    .from("tarefas")
    .select(campos)
    .eq("empresa_id", atual.empresaId)
    .is("concluida_em", null)
    .order("vence_em")
    .limit(300);
  let concluidasQ = supabase
    .from("tarefas")
    .select(campos)
    .eq("empresa_id", atual.empresaId)
    .not("concluida_em", "is", null)
    .order("concluida_em", { ascending: false })
    .limit(15);
  if (responsavel) {
    pendentesQ = pendentesQ.eq("responsavel_id", responsavel);
    concluidasQ = concluidasQ.eq("responsavel_id", responsavel);
  }
  const [{ data: pendentes }, { data: concluidas }] = await Promise.all([pendentesQ, concluidasQ]);

  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  type Linha = NonNullable<typeof pendentes>[number];
  const paraLista = (t: Linha): TarefaLista => {
    const negocio = t.negocios as unknown as { id: string; numero: number; contatos: { nome: string } } | null;
    return {
      id: t.id,
      titulo: t.titulo,
      tipo: t.tipo as TipoTarefa,
      vence_em: t.vence_em,
      concluida_em: t.concluida_em,
      responsavel:
        responsavel === atual.membroId ? null : t.responsavel_id ? (nomeMembro.get(t.responsavel_id) ?? null) : null,
      podeApagar: atual.papel === "admin" || t.criado_por === atual.membroId,
      negocio: negocio ? { id: negocio.id, rotulo: `${negocio.contatos.nome} #${negocio.numero}` } : null,
    };
  };
  const grupos = agruparPorPrazo((pendentes ?? []).map(paraLista));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Tarefas</h1>
        {podeVerOutros && (
          <form action="/tarefas" className="ml-auto flex gap-2">
            <Selecao name="responsavel" defaultValue={responsavel} aria-label="De quem">
              <option value={atual.membroId}>Minhas tarefas</option>
              <option value="">Todos que eu acompanho</option>
              {config.membros
                .filter((m) => m.ativo && m.id !== atual.membroId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </Selecao>
            <Botao type="submit" variante="secundario">
              Ver
            </Botao>
          </form>
        )}
      </div>
      <Cartao titulo={`Atrasadas (${grupos.atrasada.length})`}>
        <ListaTarefas tarefas={grupos.atrasada} vazio="Nada atrasado." />
      </Cartao>
      <Cartao titulo={`Hoje (${grupos.hoje.length})`}>
        <ListaTarefas tarefas={grupos.hoje} vazio="Nada para hoje." />
      </Cartao>
      <Cartao titulo={`Próximas (${grupos.futura.length})`}>
        <ListaTarefas tarefas={grupos.futura} vazio="Nenhuma tarefa agendada." />
      </Cartao>
      <Cartao titulo="Nova tarefa avulsa">
        <p className="mb-2 text-sm text-zinc-600">Para tarefas de um cliente, crie pela tela do negócio.</p>
        <NovaTarefa
          responsaveis={podeVerOutros ? config.membros.filter((m) => m.ativo) : []}
          responsavelPadrao={atual.membroId}
        />
      </Cartao>
      <Cartao titulo="Concluídas recentemente">
        <ListaTarefas tarefas={(concluidas ?? []).map(paraLista)} vazio="Nenhuma tarefa concluída ainda." />
      </Cartao>
    </div>
  );
}

function agruparPorPrazo(tarefas: TarefaLista[]) {
  const agora = Date.now();
  const grupos = { atrasada: [] as TarefaLista[], hoje: [] as TarefaLista[], futura: [] as TarefaLista[] };
  for (const t of tarefas) grupos[situacaoPrazo(t.vence_em, agora)].push(t);
  return grupos;
}
