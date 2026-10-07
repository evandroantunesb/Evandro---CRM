import "server-only";
import { contarAtribuicoesPendentes } from "@/lib/distribuicao-leads";
import { carregarLeadsParados } from "@/lib/leads-parados";
import { carregarLeadsSemContato } from "@/lib/leads-sem-contato";
import { carregarPropostasParadas } from "@/lib/propostas-paradas";
import type { ContagemPendencias } from "@/lib/pendencias";
import { escopoPendencias } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Notificacao = {
  id: string;
  tipo: "lead_atribuido" | "tarefa_atribuida" | "handoff_recebido" | "handoff_devolvido" | "conquista_desbloqueada";
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

/** Indicador de novidade na área de Gamificação: há conquista desbloqueada ainda não vista na Jornada. */
export async function temConquistaNaoVisualizada(empresaId: string, membroId: string): Promise<boolean> {
  const supabase = await criarClienteServidor();
  const { count } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .eq("tipo", "conquista_desbloqueada")
    .is("lida_em", null);
  return (count ?? 0) > 0;
}

/**
 * Pendências do usuário logado, separadas entre a fila de distribuição e o resto — mesmos
 * números do Painel/Leads a distribuir (admin/gestor, empresa toda) ou da Início (vendedor/SDR,
 * só a própria carteira): tarefas atrasadas, leads sem contato, leads parados e propostas paradas.
 */
export async function contarPendencias(
  empresaId: string,
  membroId: string,
  papel: string,
  diasConsideradoParado: number,
  horasConsideradoSemContato: number,
): Promise<ContagemPendencias> {
  // Escopo por lista positiva (spec RAION_SDR_REGRAS_PERMISSOES §10): gestão comercial vê a empresa
  // toda; vendedor e SDR, a própria carteira; papel sem acesso comercial não conta nada.
  const escopo = escopoPendencias(papel);
  if (!escopo.negocios && !escopo.tarefas && !escopo.leadsADistribuir) return { leadsADistribuir: 0, demais: 0 };

  const supabase = await criarClienteServidor();
  const filtro = escopo.negocios === "propria" ? { responsavelId: membroId } : {};

  let consultaTarefas = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .is("concluida_em", null)
    .lt("vence_em", new Date().toISOString());
  if (escopo.tarefas === "propria") consultaTarefas = consultaTarefas.eq("responsavel_id", membroId);

  const vazio = Promise.resolve([] as unknown[]);
  const [leadsSemContato, leadsParados, propostasParadas, tarefasAtrasadas, leadsADistribuir] = await Promise.all([
    escopo.negocios ? carregarLeadsSemContato(supabase, empresaId, { ...filtro, horasLimite: horasConsideradoSemContato }) : vazio,
    escopo.negocios ? carregarLeadsParados(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }) : vazio,
    escopo.negocios ? carregarPropostasParadas(supabase, empresaId, { ...filtro, diasLimite: diasConsideradoParado }) : vazio,
    escopo.tarefas ? consultaTarefas.then(({ count }) => count ?? 0) : Promise.resolve(0),
    // Leads a distribuir são só da gestão comercial (SDR e vendedor não aprovam atribuição).
    escopo.leadsADistribuir ? contarAtribuicoesPendentes(supabase, empresaId) : Promise.resolve(0),
  ]);

  return {
    leadsADistribuir,
    demais: leadsSemContato.length + leadsParados.length + propostasParadas.length + tarefasAtrasadas,
  };
}
