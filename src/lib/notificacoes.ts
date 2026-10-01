import "server-only";
import { carregarLeadsParados } from "@/lib/leads-parados";
import { carregarLeadsSemContato } from "@/lib/leads-sem-contato";
import { carregarPropostasParadas } from "@/lib/propostas-paradas";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Notificacao = {
  id: string;
  tipo: "lead_atribuido" | "tarefa_atribuida" | "handoff_recebido" | "handoff_devolvido";
  mensagem: string;
  link: string | null;
};

/** Notificações individuais não lidas do sininho (fase 7, spec SDR §45) — só os 2 tipos hoje suportados. */
export async function carregarNotificacoesNaoLidas(empresaId: string, membroId: string, limite = 8): Promise<Notificacao[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("notificacoes")
    .select("id, tipo, mensagem, link")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .is("lida_em", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data ?? []) as Notificacao[];
}

/**
 * Total de pendências do usuário logado — soma dos mesmos números do Painel (admin/gestor,
 * empresa toda) ou da Início (vendedor, só a própria carteira): tarefas atrasadas, leads
 * aguardando aprovação (só gestor/admin), leads sem contato, leads parados e propostas paradas.
 */
export async function contarPendencias(
  empresaId: string,
  membroId: string,
  papel: string,
  diasConsideradoParado: number,
  horasConsideradoSemContato: number,
): Promise<number> {
  const supabase = await criarClienteServidor();
  // Vendedor e SDR só veem a própria carteira (spec RAION_SDR_REGRAS_PERMISSOES §10, "restrito"); admin/gestor veem a empresa toda.
  const carteiraPropria = papel === "vendedor" || papel === "sdr";
  const filtro = carteiraPropria ? { responsavelId: membroId } : {};

  let consultaTarefas = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .is("concluida_em", null)
    .lt("vence_em", new Date().toISOString());
  if (carteiraPropria) consultaTarefas = consultaTarefas.eq("responsavel_id", membroId);

  const [leadsSemContato, leadsParados, propostasParadas, { count: tarefasAtrasadas }] = await Promise.all([
    carregarLeadsSemContato(supabase, empresaId, { ...filtro, horasLimite: horasConsideradoSemContato }),
    carregarLeadsParados(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }),
    carregarPropostasParadas(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }),
    consultaTarefas,
  ]);

  let total = leadsSemContato.length + leadsParados.length + propostasParadas.length + (tarefasAtrasadas ?? 0);

  // Leads aguardando aprovação são só do gestor/admin (SDR e vendedor não aprovam atribuição).
  if (papel === "admin" || papel === "gestor") {
    const { count: aguardando } = await supabase
      .from("atribuicoes_leads")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("status", "pendente");
    total += aguardando ?? 0;
  }

  return total;
}
