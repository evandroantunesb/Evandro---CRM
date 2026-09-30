import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, type LucideIcon } from "lucide-react";
import { ListaTarefas, type TarefaLista } from "@/components/lista-tarefas";
import { NovaTarefa } from "@/components/nova-tarefa";
import { Botao, Cartao, Selecao } from "@/components/ui";
import { carregarConfiguracao, fimDaSemana, inicioDoDia, situacaoPrazo } from "@/lib/crm";
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
  const inicioSemana = inicioDoDia(fimDaSemana() - 6 * 86_400_000);
  let concluidasSemanaQ = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", atual.empresaId)
    .not("concluida_em", "is", null)
    .gte("concluida_em", new Date(inicioSemana).toISOString());
  if (responsavel) {
    pendentesQ = pendentesQ.eq("responsavel_id", responsavel);
    concluidasQ = concluidasQ.eq("responsavel_id", responsavel);
    concluidasSemanaQ = concluidasSemanaQ.eq("responsavel_id", responsavel);
  }
  const [{ data: pendentes }, { data: concluidas }, { count: concluidasSemana }] = await Promise.all([
    pendentesQ,
    concluidasQ,
    concluidasSemanaQ,
  ]);

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
  const listaPendentes = (pendentes ?? []).map(paraLista);
  const grupos = agruparPorPrazo(listaPendentes);
  // Prioridades: as mesmas tarefas pendentes, só as primeiras — a consulta já vem ordenada por prazo,
  // então atrasadas (prazo mais antigo) sempre aparecem primeiro, sem lógica de ordenação própria.
  const prioridades = listaPendentes.slice(0, 5);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Tarefas</h1>
          <p className="text-sm text-zinc-500">Acompanhe suas atividades do dia e próximos compromissos.</p>
        </div>
        {podeVerOutros && (
          <form action="/tarefas" className="flex gap-2">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTarefa
          Icone={CalendarClock}
          tom="ambar"
          valor={grupos.hoje.length}
          legenda="Hoje"
          rodape={grupos.hoje.length === 1 ? "tarefa" : "tarefas"}
        />
        <KpiTarefa
          Icone={AlertTriangle}
          tom="vermelho"
          valor={grupos.atrasada.length}
          legenda="Atrasadas"
          rodape={grupos.atrasada.length === 1 ? "tarefa" : "tarefas"}
        />
        <KpiTarefa
          Icone={Clock3}
          tom="neutro"
          valor={grupos.futura.length}
          legenda="Próximas"
          rodape={grupos.futura.length === 1 ? "tarefa" : "tarefas"}
        />
        <KpiTarefa
          Icone={CheckCircle2}
          tom="verde"
          valor={concluidasSemana ?? 0}
          legenda="Concluídas na semana"
          rodape={concluidasSemana === 1 ? "tarefa" : "tarefas"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Cartao titulo="Minhas prioridades">
          <ListaTarefas tarefas={prioridades} vazio="Nenhuma prioridade pendente. Sua operação está em dia." />
        </Cartao>
        <Cartao titulo="Nova tarefa avulsa">
          <p className="mb-2 text-sm text-zinc-600">Para tarefas de um cliente, crie pela tela do negócio.</p>
          <NovaTarefa
            responsaveis={podeVerOutros ? config.membros.filter((m) => m.ativo) : []}
            responsavelPadrao={atual.membroId}
          />
        </Cartao>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo={`Hoje (${grupos.hoje.length})`}>
          <ListaTarefas tarefas={grupos.hoje} vazio="Nada para hoje." />
        </Cartao>
        <Cartao titulo={`Próximas (${grupos.futura.length})`}>
          <ListaTarefas tarefas={grupos.futura} vazio="Nenhuma tarefa agendada." />
        </Cartao>
      </div>

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

const TOM_KPI = {
  neutro: "bg-zinc-100 text-zinc-600",
  vermelho: "bg-red-50 text-red-700",
  ambar: "bg-amber-50 text-amber-700",
  verde: "bg-green-50 text-green-700",
};

/** Card de indicador da tela de Tarefas: mesmo formato visual dos KPIs da Início, com cor por situação. */
function KpiTarefa({
  Icone,
  tom,
  valor,
  legenda,
  rodape,
}: {
  Icone: LucideIcon;
  tom: keyof typeof TOM_KPI;
  valor: number;
  legenda: string;
  rodape: string;
}) {
  return (
    <div className="flex min-h-[112px] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TOM_KPI[tom]}`}>
        <Icone size={17} />
      </span>
      <div>
        <p className="text-xs font-medium text-zinc-500">{legenda}</p>
        <p className="text-2xl font-semibold text-zinc-900 [font-variant-numeric:tabular-nums]">{valor}</p>
      </div>
      <p className="text-xs text-zinc-500">{rodape}</p>
    </div>
  );
}
