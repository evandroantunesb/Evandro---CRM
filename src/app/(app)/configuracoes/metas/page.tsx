import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { MetricaMeta } from "@/lib/tipos";
import { LinhaMeta, NovaMeta } from "./formularios";

export default async function ConfigMetas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: metas }, config] = await Promise.all([
    supabase
      .from("metas")
      .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("periodo_inicio", { ascending: false }),
    carregarConfiguracao(atual.empresaId),
  ]);

  const membros = config.membros.filter((m) => m.ativo);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Metas</h1>
      <p className="text-sm text-zinc-600">
        Cada meta é individual: escolha o colaborador, a métrica e o período. O progresso é calculado sozinho a
        partir dos negócios e tarefas já registrados no CRM.
      </p>
      <Cartao titulo="Nova meta">
        <NovaMeta membros={membros} />
      </Cartao>
      <Cartao titulo={`Metas (${metas?.length ?? 0})`}>
        {!metas?.length && <p className="text-sm text-zinc-600">Nenhuma meta cadastrada ainda.</p>}
        {(metas ?? []).map((m) => (
          <LinhaMeta
            key={m.id}
            meta={{
              id: m.id,
              titulo: m.titulo,
              metrica: m.metrica as MetricaMeta,
              membroId: m.membro_id,
              periodoInicio: m.periodo_inicio,
              periodoFim: m.periodo_fim,
              valorAlvo: m.valor_alvo,
              ativa: m.ativa,
            }}
            membros={membros}
          />
        ))}
      </Cartao>
    </div>
  );
}
