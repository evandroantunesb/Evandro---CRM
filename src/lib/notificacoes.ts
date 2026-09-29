import "server-only";
import { carregarLeadsParados } from "@/lib/leads-parados";
import { carregarPropostasParadas } from "@/lib/propostas-paradas";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Total de pendências do usuário logado — soma dos mesmos números do Painel (admin/gestor,
 * empresa toda) ou da Início (vendedor, só a própria carteira): tarefas atrasadas, leads
 * aguardando aprovação (só gestor/admin), leads parados e propostas paradas.
 */
export async function contarPendencias(
  empresaId: string,
  membroId: string,
  papel: string,
  diasConsideradoParado: number,
): Promise<number> {
  const supabase = await criarClienteServidor();
  const ehVendedor = papel === "vendedor";
  const filtro = ehVendedor ? { responsavelId: membroId } : {};

  let consultaTarefas = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .is("concluida_em", null)
    .lt("vence_em", new Date().toISOString());
  if (ehVendedor) consultaTarefas = consultaTarefas.eq("responsavel_id", membroId);

  const [leadsParados, propostasParadas, { count: tarefasAtrasadas }] = await Promise.all([
    carregarLeadsParados(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }),
    carregarPropostasParadas(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }),
    consultaTarefas,
  ]);

  let total = leadsParados.length + propostasParadas.length + (tarefasAtrasadas ?? 0);

  if (!ehVendedor) {
    const { count: aguardando } = await supabase
      .from("atribuicoes_leads")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("status", "pendente");
    total += aguardando ?? 0;
  }

  return total;
}
