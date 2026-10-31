import { Cartao, Voltar } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaRegra, NovaRegra, type Regra } from "./formularios";

export default async function ConfigTarefasAutomaticas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  // Enquanto a migration não estiver aplicada (preview usa o banco de produção), a lista vem vazia.
  const { data } = await supabase
    .from("tarefas_automaticas_regras")
    .select("id, gatilho_setor, gatilho_status, setor, titulo, descricao, prazo_dias_uteis, ativa")
    .eq("empresa_id", atual.empresaId)
    .order("ativa", { ascending: false })
    .order("created_at");
  const regras: Regra[] = (data ?? []).map((r) => ({
    id: r.id,
    gatilhoSetor: r.gatilho_setor,
    gatilhoStatus: r.gatilho_status,
    setor: r.setor,
    titulo: r.titulo,
    descricao: r.descricao,
    prazoDiasUteis: r.prazo_dias_uteis,
    ativa: r.ativa,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Tarefas automáticas</h1>
      <p className="text-sm text-zinc-600">
        Quando um setor da obra chega ao status escolhido, a tarefa nasce para o setor indicado: com o responsável principal desse setor
        na obra ou, sem ele, na fila do setor. Cada regra abre uma única tarefa por obra, mesmo que o status volte e chegue de novo.
        Regra desativada para de abrir tarefas; as já criadas continuam.
      </p>
      <Cartao titulo="Nova regra">
        <NovaRegra />
      </Cartao>
      <Cartao titulo={`Regras (${regras.length})`}>
        {regras.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma regra cadastrada.</p>
        ) : (
          regras.map((r) => <LinhaRegra key={r.id} regra={r} />)
        )}
      </Cartao>
    </div>
  );
}
