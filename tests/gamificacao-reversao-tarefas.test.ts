/**
 * Reversibilidade causal de tarefas/reuniões/visitas (Evandro, 2026-10-02): reabrir uma
 * tarefa já concluída zera `resultado` (`preparar_tarefa()`), mas até aqui não existia
 * contrapartida causal — o crédito de `task.completed`/`reuniao.realizada`/`visita.realizada`
 * ficava ativo pra sempre, e recompletar acumulava com o anterior em vez de substituir.
 * Ver `20261002150000_gamificacao_reversao_tarefas.sql`: reabertura insere um evento de
 * reversão dedicado (`task.completed_revertido`/`<tipo>.realizada_revertida`, mesmo padrão
 * de `pagamento.confirmacao_estornada`) e reverte só o `point_ledger` do evento ativo
 * específico (`estornar_lancamentos_do_evento`, por `evento_id`) — nunca apaga histórico.
 * Regra: no máximo 1 ocorrência ativa por ciclo de conclusão (concluir +4, reabrir -4,
 * concluir de novo +4, líquido = +4 — nunca acumula).
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { TipoTarefa } from "@/lib/tipos";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let membroId: string;

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["rt-admin", "rt-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Reversão tarefas ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    ])
    .select("id, user_id");
  membroId = vinculos!.find((v) => v.user_id === vendedor.id)!.id;
});

// `gamification_rules` só aceita insert de quem tem papel admin. xp=moedas=4 (exemplo do
// Evandro: +4 ao concluir, -4 ao reabrir).
async function criarRegra(evento_tipo: string, valor = 4) {
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({ empresa_id: empresa, nome: evento_tipo, evento_tipo, xp: valor, moedas: valor })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

function criarTarefa(tipo: TipoTarefa, venceEmIso: string) {
  return vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: `Tarefa ${tipo} ${sufixo}-${Math.random()}`, tipo, vence_em: venceEmIso, responsavel_id: membroId })
    .select("id")
    .single();
}

async function ledgerAtivo(regraId: string, tarefaId: string) {
  const { data } = await servico
    .from("point_ledger")
    .select("id, estornado, xp, evento_id")
    .eq("regra_id", regraId)
    .eq("referencia_id", tarefaId)
    .order("created_at");
  return data!;
}

const PASSADO = new Date(Date.now() - 3600e3).toISOString();

describe("reversão causal: task.completed", () => {
  it("tarefa concluída pontua uma vez", async () => {
    const regraId = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);

    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].estornado).toBe(false);
    expect(ledger[0].xp).toBe(4);
  });

  it("concluída novamente sem reabertura real não duplica", async () => {
    const regraId = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);
    // Edita outro campo sem tocar concluida_em — não é uma reabertura, a transição
    // null→não-null já aconteceu e não se repete.
    await vendedor.cliente.from("tarefas").update({ titulo: `Editada ${sufixo}` }).eq("id", tarefa!.id);

    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger).toHaveLength(1);
  });

  it("concluída → reaberta → crédito revertido (sem apagar o lançamento original)", async () => {
    const regraId = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);
    const antes = await ledgerAtivo(regraId, tarefa!.id);
    const eventoOriginalId = antes[0].evento_id;

    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);

    const depois = await ledgerAtivo(regraId, tarefa!.id);
    expect(depois).toHaveLength(1);
    expect(depois[0].id).toBe(antes[0].id);
    expect(depois[0].estornado).toBe(true);

    const { data: reversao } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, payload")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed_revertido");
    expect(reversao).toHaveLength(1);
    expect(reversao![0].ator_id).toBe(vendedor.id);
    expect(reversao![0].beneficiario_id).toBe(vendedor.id);
    expect((reversao![0].payload as Record<string, unknown>).evento_original_id).toBe(eventoOriginalId);
  });

  it("concluída → reaberta → concluída novamente: só uma conclusão permanece ativa (líquido = +4)", async () => {
    const regraId = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);

    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "sem_resposta" }).eq("id", tarefa!.id);

    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].estornado).toBe(true);
    expect(ledger[1].estornado).toBe(false);
    const liquido = ledger.filter((l) => !l.estornado).reduce((soma, l) => soma + l.xp, 0);
    expect(liquido).toBe(4);
  });

  it("reabrir duas vezes seguidas (idempotência): a segunda não é uma transição real, não duplica reversão", async () => {
    const regraId = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    // concluida_em já é null — este update não muda old→new, não é uma nova reabertura.
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);

    const { data: reversoes } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed_revertido");
    expect(reversoes).toHaveLength(1);
    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger.filter((l) => l.estornado)).toHaveLength(1);
  });

  it("cada reversão aponta pra sua própria ocorrência, nunca reaproveitando uma já revertida (A→revA→B→revB→C)", async () => {
    // Sem regra configurada aqui de propósito — identificação do evento ativo precisa vir
    // da cadeia evento→reversão (payload.evento_original_id), não da existência de
    // lançamento em point_ledger (ver teste seguinte, que cobre isso explicitamente).
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);

    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id); // A
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id); // revA
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "sem_resposta" }).eq("id", tarefa!.id); // B
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id); // revB
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id); // C

    const { data: conclusoes } = await servico
      .from("eventos")
      .select("id, created_at")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed")
      .order("created_at");
    expect(conclusoes).toHaveLength(3);
    const [eventoA, eventoB] = conclusoes!;

    const { data: reversoes } = await servico
      .from("eventos")
      .select("payload, created_at")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed_revertido")
      .order("created_at");
    expect(reversoes).toHaveLength(2);
    const [revA, revB] = reversoes!;
    expect((revA.payload as Record<string, unknown>).evento_original_id).toBe(eventoA.id);
    expect((revB.payload as Record<string, unknown>).evento_original_id).toBe(eventoB.id);
    // revA nunca aponta pra B, revB nunca aponta pra A (nenhuma reaproveitada).
    expect((revA.payload as Record<string, unknown>).evento_original_id).not.toBe(eventoB.id);
  });

  it("ciclo completo sem nenhuma regra de pontos configurada: ocorrência e reversão existem, nada pra estornar, função não falha", async () => {
    // Empresa própria e isolada: a `empresa` compartilhada do describe já acumula regras
    // `task.completed` de outros testes (criarRegra), então "nenhuma regra configurada" só
    // é garantido numa empresa nova, sem nenhum insert em gamification_rules.
    const { data: emp } = await servico.from("empresas").insert({ nome: `Sem regra ${sufixo}-${Math.random()}` }).select("id").single();
    const empresaIsolada = emp!.id;
    const { data: vinculo } = await servico
      .from("empresa_membros")
      .insert({ empresa_id: empresaIsolada, user_id: vendedor.id, papel: "vendedor" })
      .select("id")
      .single();
    const membroIsoladoId = vinculo!.id;

    const { data: tarefa } = await vendedor.cliente
      .from("tarefas")
      .insert({ empresa_id: empresaIsolada, titulo: `Tarefa sem regra ${sufixo}`, tipo: "ligacao", vence_em: PASSADO, responsavel_id: membroIsoladoId })
      .select("id")
      .single();

    const { error: erroConcluir } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" })
      .eq("id", tarefa!.id);
    expect(erroConcluir).toBeNull();

    const { data: eventoCompleted } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed")
      .single();
    expect(eventoCompleted).not.toBeNull();
    const { data: ledgerSemRegra } = await servico.from("point_ledger").select("id").eq("referencia_id", tarefa!.id);
    expect(ledgerSemRegra).toHaveLength(0);

    const { error: erroReabrir } = await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    expect(erroReabrir).toBeNull();

    const { data: reversao } = await servico
      .from("eventos")
      .select("payload")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "task.completed_revertido")
      .single();
    expect(reversao).not.toBeNull();
    expect((reversao!.payload as Record<string, unknown>).evento_original_id).toBe(eventoCompleted!.id);

    const { error: erroConcluirDeNovo } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "sem_resposta" })
      .eq("id", tarefa!.id);
    expect(erroConcluirDeNovo).toBeNull();
    const { data: conclusoes } = await servico.from("eventos").select("id").eq("entidade_id", tarefa!.id).eq("tipo", "task.completed");
    expect(conclusoes).toHaveLength(2);
  });
});

describe("reversão causal: reuniao.realizada / visita.realizada", () => {
  it("reunião realizada → reaberta → evento reuniao.realizada revertido", async () => {
    const regraId = await criarRegra("reuniao.realizada");
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);
    const antes = await ledgerAtivo(regraId, tarefa!.id);
    expect(antes).toHaveLength(1);

    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);

    const depois = await ledgerAtivo(regraId, tarefa!.id);
    expect(depois[0].estornado).toBe(true);
    const { data: reversao } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "reuniao.realizada_revertida");
    expect(reversao).toHaveLength(1);
  });

  it("reunião realizada → reaberta → realizada novamente: nova ocorrência válida, anterior historicamente revertida", async () => {
    const regraId = await criarRegra("reuniao.realizada");
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);

    const { data: eventosRealizada } = await servico.from("eventos").select("id").eq("entidade_id", tarefa!.id).eq("tipo", "reuniao.realizada");
    expect(eventosRealizada).toHaveLength(2);
    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].estornado).toBe(true);
    expect(ledger[1].estornado).toBe(false);
  });

  it("reunião no_show → reaberta → não tenta reverter reuniao.realizada inexistente (mas task.completed reverte normalmente)", async () => {
    const regraTask = await criarRegra("task.completed");
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "no_show" }).eq("id", tarefa!.id);

    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);

    const { data: reversaoReuniao } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "reuniao.realizada_revertida");
    expect(reversaoReuniao).toHaveLength(0);

    const ledgerTask = await ledgerAtivo(regraTask, tarefa!.id);
    expect(ledgerTask[0].estornado).toBe(true);
  });

  it("visita realizada: mesmo comportamento da reunião", async () => {
    const regraId = await criarRegra("visita.realizada");
    const { data: tarefa } = await criarTarefa("visita", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);

    const ledger = await ledgerAtivo(regraId, tarefa!.id);
    expect(ledger[0].estornado).toBe(true);
    const { data: reversao } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", tarefa!.id)
      .eq("tipo", "visita.realizada_revertida");
    expect(reversao).toHaveLength(1);
  });
});
