import "server-only";
import { ROTULO_SETOR } from "@/lib/obras/rotulos";
import { NEGOCIOS, OBRAS, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { Papel } from "@/lib/tipos";
import {
  contarAbertasPorAba,
  contarPendenciasDoSetor,
  hojeBrasilia,
  SETORES_TAREFA,
  type FiltroTarefasSetor,
  type MembroOpcao,
  type SetorTarefa,
  type StatusTarefaSetor,
  type TarefaSetorVM,
} from "@/lib/tarefas-setor-regras";

/**
 * Tarefas de setor (20261029210000_tarefas_setor.sql): pedidos do comercial no negócio e tarefas da obra para
 * Compras, Engenharia ou Operacional. A RLS decide o que cada um vê; aqui só se monta a tela. Os botões seguem a
 * mesma regra das RPCs (que conferem de novo): quem atua no setor age; coordenador e admin atribuem; quem pediu
 * cancela e reabre.
 */

export async function carregarTarefasSetor(
  supabase: SupabaseServidor,
  {
    empresaId,
    membroId,
    papel,
    obraId,
    negocioId,
    filtro = "abertas",
    agora = new Date(),
  }: {
    empresaId: string;
    membroId: string;
    papel: Papel;
    obraId?: string;
    negocioId?: string;
    filtro?: FiltroTarefasSetor | "todas";
    agora?: Date;
  },
): Promise<{ tarefas: TarefaSetorVM[]; membrosPorSetor: Partial<Record<SetorTarefa, MembroOpcao[]>> }> {
  let consulta = supabase
    .from("tarefas_setor")
    .select("id, titulo, descricao, setor, prazo, status, resposta, motivo_cancelamento, origem, responsavel_id, criado_por, obra_id, negocio_id")
    .eq("empresa_id", empresaId)
    .order("prazo")
    .order("created_at")
    .limit(300);
  if (obraId) consulta = consulta.eq("obra_id", obraId);
  if (negocioId) consulta = consulta.eq("negocio_id", negocioId);
  if (filtro === "concluidas") consulta = consulta.eq("status", "concluida");
  else if (filtro !== "todas") consulta = consulta.eq("status", "aberta");
  if (filtro === "minhas") consulta = consulta.eq("responsavel_id", membroId);
  if (filtro === "fila") consulta = consulta.is("responsavel_id", null);
  if (filtro === "pedidas") consulta = consulta.eq("criado_por", membroId);

  const [{ data: linhas }, { data: identidades }, { data: meusSetores }] = await Promise.all([
    consulta,
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
    supabase.from("membro_setores_obra").select("setor, capacidade").eq("empresa_id", empresaId).eq("membro_id", membroId),
  ]);
  const tarefas = (linhas ?? []).filter((t) => (SETORES_TAREFA as readonly string[]).includes(t.setor));
  const { data: contextos } = tarefas.length
    ? await supabase.rpc("contexto_tarefas_setor", { p_ids: tarefas.map((t) => t.id) })
    : { data: [] };

  const nomes = new Map((identidades ?? []).map((m) => [m.membro_id, m.nome]));
  const contexto = new Map((contextos ?? []).map((c) => [c.tarefa_id, c]));
  const capacidade = new Map((meusSetores ?? []).map((s) => [s.setor, s.capacidade]));
  const admin = papel === "admin";
  const hoje = hojeBrasilia(agora);

  // Quem pode escolher o responsável recebe a lista do setor (a RPC só a entrega a admin e coordenador).
  const setoresAtribuiveis = SETORES_TAREFA.filter((s) => admin || capacidade.get(s) === "coordenar");
  const membrosPorSetor: Partial<Record<SetorTarefa, MembroOpcao[]>> = {};
  await Promise.all(
    setoresAtribuiveis
      .filter((s) => tarefas.some((t) => t.setor === s))
      .map(async (s) => {
        const { data } = await supabase.rpc("membros_do_setor", { p_empresa_id: empresaId, p_setor: s });
        membrosPorSetor[s] = (data ?? []).map((m) => ({ id: m.membro_id, nome: nomes.get(m.membro_id) ?? "Membro" }));
      }),
  );

  return {
    membrosPorSetor,
    tarefas: tarefas.map((t) => {
      const setor = t.setor as SetorTarefa;
      const c = contexto.get(t.id);
      const atuaNoSetor = capacidade.has(setor);
      const coordena = admin || capacidade.get(setor) === "coordenar";
      const pedi = t.criado_por === membroId;
      const cliente = [c?.cliente_nome, [c?.cidade, c?.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
      const referencia = t.obra_id
        ? { rotulo: `Obra #${c?.obra_numero ?? "?"}${cliente ? ` · ${cliente}` : ""}`, href: pode(papel, OBRAS) ? `/obras/${t.obra_id}` : null }
        : {
            rotulo: `Negócio #${c?.negocio_numero ?? "?"}${cliente ? ` · ${cliente}` : ""}`,
            href: pode(papel, NEGOCIOS) && t.negocio_id ? `/negocios/${t.negocio_id}` : null,
          };
      const status = t.status as StatusTarefaSetor;
      return {
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        setor,
        setorRotulo: ROTULO_SETOR[setor],
        prazo: t.prazo,
        status,
        atrasada: status === "aberta" && t.prazo < hoje,
        resposta: t.resposta,
        motivoCancelamento: t.motivo_cancelamento,
        automatica: t.origem === "automatica",
        responsavel: t.responsavel_id ? { id: t.responsavel_id, nome: nomes.get(t.responsavel_id) ?? "Membro" } : null,
        pedidoPor: t.criado_por ? (nomes.get(t.criado_por) ?? null) : null,
        referencia,
        obraId: t.obra_id,
        negocioId: t.negocio_id,
        podeAgir: status === "aberta" && (admin || atuaNoSetor),
        podeAtribuir: status === "aberta" && coordena,
        podeCancelar: status === "aberta" && (pedi || coordena),
        podeReabrir: status === "concluida" && (admin || atuaNoSetor || pedi),
      };
    }),
  };
}

async function abertasVisiveis(supabase: SupabaseServidor, empresaId: string) {
  const { data } = await supabase
    .from("tarefas_setor")
    .select("responsavel_id, criado_por, setor")
    .eq("empresa_id", empresaId)
    .eq("status", "aberta")
    .limit(1000);
  return data ?? [];
}

/** Números das abas da tela de tarefas: abertas que a pessoa vê em cada aba. */
export async function contarAbasTarefasSetor(supabase: SupabaseServidor, empresaId: string, membroId: string) {
  return contarAbertasPorAba(await abertasVisiveis(supabase, empresaId), membroId);
}

/** Pendências de tarefas do setor para o sininho de quem executa nos setores. */
export async function contarPendenciasTarefasSetor(supabase: SupabaseServidor, empresaId: string, membroId: string): Promise<number> {
  const [linhas, { data: setores }] = await Promise.all([
    abertasVisiveis(supabase, empresaId),
    supabase.from("membro_setores_obra").select("setor").eq("empresa_id", empresaId).eq("membro_id", membroId),
  ]);
  return contarPendenciasDoSetor(linhas, membroId, (setores ?? []).map((s) => s.setor));
}
