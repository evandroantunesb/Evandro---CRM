/**
 * Eventos "reunião realizada" / "visita realizada" (Evandro, 2026-10-01): emitidos só
 * quando tarefas.tipo é reunião/visita *e* resultado é 'realizada' — sinal confiável desde
 * a #109 (resultado terminal, 'realizada' só liberado depois do horário previsto). Dois
 * eventos dedicados (não um `task.completed` genérico filtrado), já que a condição de regra
 * só compara 1 campo por vez.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { TipoTarefa } from "@/lib/tipos";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario;
let empresa: string;
let membroId: string;

beforeAll(async () => {
  vendedor = await criarUsuario("rr-vendedor");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Reunião realizada ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: vinculo } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" })
    .select("id")
    .single();
  membroId = vinculo!.id;
});

function criarTarefa(tipo: TipoTarefa, venceEmIso: string) {
  return vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: `Tarefa ${tipo} ${sufixo}-${Math.random()}`, tipo, vence_em: venceEmIso, responsavel_id: membroId })
    .select("id")
    .single();
}

const PASSADO = new Date(Date.now() - 3600e3).toISOString();

describe("reuniao.realizada / visita.realizada", () => {
  it("concluir reunião com resultado 'realizada' emite reuniao.realizada", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error).toBeNull();

    const { data: eventos } = await servico.from("eventos").select("ator_id").eq("entidade_id", tarefa!.id).eq("tipo", "reuniao.realizada");
    expect(eventos).toHaveLength(1);
    expect(eventos![0].ator_id).toBe(vendedor.id);
  });

  it("concluir visita com resultado 'realizada' emite visita.realizada", async () => {
    const { data: tarefa } = await criarTarefa("visita", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error).toBeNull();

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", tarefa!.id).eq("tipo", "visita.realizada");
    expect(eventos).toHaveLength(1);
  });

  it("reunião concluída com 'no_show' não emite reuniao.realizada", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "no_show" }).eq("id", tarefa!.id);

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", tarefa!.id).eq("tipo", "reuniao.realizada");
    expect(eventos).toHaveLength(0);
  });

  it("reunião cancelada não emite reuniao.realizada", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "cancelada" }).eq("id", tarefa!.id);

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", tarefa!.id).eq("tipo", "reuniao.realizada");
    expect(eventos).toHaveLength(0);
  });

  it("ligação com resultado 'realizada' não se aplica (tipo não é reunião/visita) — nem chega a ser aceita", async () => {
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error).not.toBeNull();
  });
});
